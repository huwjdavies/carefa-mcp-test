import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createOAuthBridge } from './oauth.mjs';

const issuer = 'https://oauth.example.test';
const redirectUri = 'https://ai.example.test/callback';
const resource = issuer + '/mcp';
const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');

function mockResponse() {
  return {
    status: 0, headers: {}, text: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, Object.fromEntries(Object.entries(headers).map(([k,v]) => [k.toLowerCase(),v]))); },
    end(text = '') { this.text = text; },
    get json() { return this.text ? JSON.parse(this.text) : null; },
  };
}
async function call(bridge, method, path, { form, json, cookie } = {}) {
  const payload = form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : '';
  const req = {
    method,
    headers: { ...(form ? {'content-type':'application/x-www-form-urlencoded'} : {}), ...(json ? {'content-type':'application/json'} : {}), ...(cookie ? {cookie} : {}) },
    async *[Symbol.asyncIterator]() { if (payload) yield Buffer.from(payload); },
  };
  const res = mockResponse();
  await bridge.handle(req, res, new URL(path, issuer));
  return res;
}
function fixture() {
  let time = Date.now();
  const bridge = createOAuthBridge({
    publicUrl: issuer, appUrl:'https://carefa.example.test',
    redirectUris:[redirectUri], configured:() => true,
    exchangeCode: async code => code === 'owner-a' ? 'A'.repeat(43) : 'B'.repeat(43),
    now: () => time,
  });
  return { bridge, advance(ms) { time += ms; } };
}
async function grant(bridge, owner) {
  const registered = await call(bridge,'POST','/oauth/register',{json:{redirect_uris:[redirectUri],grant_types:['authorization_code','refresh_token']}});
  assert.equal(registered.status,201);
  const client_id = registered.json.client_id;
  const authorize = new URL('/oauth/authorize',issuer);
  Object.entries({client_id,redirect_uri:redirectUri,response_type:'code',code_challenge:challenge,code_challenge_method:'S256',resource,scope:'collection:read',state:'random-state'}).forEach(([k,v])=>authorize.searchParams.set(k,v));
  const start = await call(bridge,'GET',authorize.pathname+authorize.search);
  assert.equal(start.status,302);
  const cb = new URL(start.headers.location).searchParams.get('cb');
  const cookie = start.headers['set-cookie'].split(';')[0];
  const callback = new URL(cb);
  callback.searchParams.set('code',owner);
  const finish = await call(bridge,'GET',callback.pathname+callback.search,{cookie});
  assert.equal(finish.status,302);
  const code = new URL(finish.headers.location).searchParams.get('code');
  const token = await call(bridge,'POST','/oauth/token',{form:{grant_type:'authorization_code',code,client_id,redirect_uri:redirectUri,code_verifier:verifier,resource}});
  assert.equal(token.status,200);
  return {client_id,...token.json};
}
test('authorization and refresh keep independent collector links', async () => {
  const {bridge} = fixture();
  const a = await grant(bridge,'owner-a');
  const b = await grant(bridge,'owner-b');
  assert.equal((await bridge.authenticate({headers:{authorization:'Bearer '+a.access_token}})).linkToken,'A'.repeat(43));
  assert.equal((await bridge.authenticate({headers:{authorization:'Bearer '+b.access_token}})).linkToken,'B'.repeat(43));
  const refresh = await call(bridge,'POST','/oauth/token',{form:{grant_type:'refresh_token',refresh_token:a.refresh_token,client_id:a.client_id,resource}});
  assert.equal(refresh.status,200);
  assert.notEqual(refresh.json.refresh_token,a.refresh_token);
  assert.equal((await bridge.authenticate({headers:{authorization:'Bearer '+refresh.json.access_token}})).linkToken,'A'.repeat(43));
  assert.equal((await bridge.authenticate({headers:{authorization:'Bearer '+b.access_token}})).linkToken,'B'.repeat(43));
  const replay = await call(bridge,'POST','/oauth/token',{form:{grant_type:'refresh_token',refresh_token:a.refresh_token,client_id:a.client_id,resource}});
  assert.equal(replay.status,400);
  const wrongResource = await call(bridge,'POST','/oauth/token',{form:{grant_type:'refresh_token',refresh_token:refresh.json.refresh_token,client_id:a.client_id,resource:'https://wrong.example.test/mcp'}});
  assert.equal(wrongResource.status,400);
  const validAfterRejection = await call(bridge,'POST','/oauth/token',{form:{grant_type:'refresh_token',refresh_token:refresh.json.refresh_token,client_id:a.client_id,resource}});
  assert.equal(validAfterRejection.status,200);
});
test('expiry blocks refresh; in-memory state does not survive new instance', async () => {
  const f = fixture();
  const a = await grant(f.bridge,'owner-a');
  f.advance(31*24*60*60*1000);
  const expired = await call(f.bridge,'POST','/oauth/token',{form:{grant_type:'refresh_token',refresh_token:a.refresh_token,client_id:a.client_id,resource}});
  assert.equal(expired.status,400);
  assert.equal(await f.bridge.authenticate({headers:{authorization:'Bearer '+a.access_token}}),undefined);
  const fresh = fixture();
  assert.equal(await fresh.bridge.authenticate({headers:{authorization:'Bearer '+a.access_token}}),undefined);
});
