# ChatGPT distribution findings — 2026-10-19

CAREFA uses the outer OAuth connection: ChatGPT is the OAuth client; CAREFA controls its login, consent and data access. A public OAuth client ID is not a secret or proof of a particular ChatGPT identity. A successful protected read verifies the CAREFA grant, not a person's ChatGPT profile, device, subscription or current installation screen.

## Collector journey

Provide **Add My AI Assistant → My AI Assistants → Continue in ChatGPT** pointing only to the actual verified CAREFA listing. The collector installs/connects there, signs into CAREFA in the browser that opens, reviews the displayed CAREFA collector identity and explicitly approves read-only access. Ask one collection question in a new ChatGPT chat, then return to CAREFA and check status. Installation can request authentication immediately or on first use. Ordinary directory installation does not require entering server URLs or API keys.

On iPhone the browser session used for CAREFA approval can differ from the Home Screen app. The consent page must show the signed-in collector identity. A wrong account must cancel and restart; existing grants never change their owner after a browser account switch.

The launch button stays unavailable until the actual listing/invitation has been tested. No CAREFA listing ID was discovered or invented in this assignment. Public rollout is therefore still blocked. Do not substitute a custom-server setup tutorial for ordinary public onboarding.

## Developer and publisher work

The documented public remote-MCP submission process requires a stable HTTPS endpoint, a plugin package, verified publisher identity, domain verification, tool scan, review and explicit publication. Private reviewer credentials belong in the private portal fields, never the repository/package or chat. Development custom-MCP creation is a separate policy-controlled testing surface, not proof of public installability.

The current authentication documentation supports OAuth authorization code + S256 PKCE, exact redirect allowlists, protected-resource metadata and per-tool OAuth declarations. It documents issuer identification (`iss`) in successful/error authorization responses. The code now advertises and returns it, but no existing callback allowlist/configuration was changed. Copy the actual URI shown in the approved plugin management page only after separate configuration approval; do not infer a new callback from documentation examples.

## Eligibility and limitations

Official user documentation describes plugins on web/desktop/mobile, with mobile using plugins available to that account; desktop-only plugins cannot satisfy CAREFA's iPhone journey. Workspace policy controls custom server setup/use. An exact entitlement matrix for this unpublished CAREFA integration was not established; no promise is made that every Free/Go/Plus/workspace user can install it in every region or client. Verify the eventual listing using representative ordinary collector accounts and actual iPhone surfaces.

“Sign in with ChatGPT” is a separate identity/partner capability. It is unnecessary for V1's existing CAREFA-owned login and does not automatically authorise data/tools. CAREFA must not collect ChatGPT credentials, embed its login or claim a click silently installed or verified a connection.

## Official sources inspected

- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/deploy/connect-chatgpt
- https://learn.chatgpt.com/docs/plugins
- https://learn.chatgpt.com/docs/pricing (not sufficient to establish CAREFA-specific eligibility)

These findings are documentation research, not a completed publication, account-eligibility test or successful fresh ChatGPT onboarding session.


## Phase 3 recheck — 2026-10-19

The authentication, submission and user plugin documentation above were fetched again in Phase 3. No supported automatic install/account-link shortcut or usable CAREFA public listing was established. The implementation retains exact redirect allowlists, issuer identification, PKCE/resource checks and tool OAuth declarations. Compatibility is prepared, not proven through a fresh ChatGPT session. Corporate/workspace-domain identity requirements may require publisher review; do not add email to collecting tools to guess at compliance. Confirm any private OAuth-only identity endpoint requirement separately with OpenAI before public submission. The no-email collection-tool boundary stays intact.
