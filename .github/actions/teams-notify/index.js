/**
 * .github/actions/teams-notify/index.js
 *
 * Custom GitHub Action — Microsoft Teams Notification
 *
 * Reads inputs from the INPUT_* environment variables that GitHub Actions
 * automatically injects for every declared input in action.yml.
 *
 * Uses the native fetch API.
 * No external npm dependencies are needed.
 */

"use strict";

// ─── 1. Read inputs ───────────────────────────────────────────────────────────

const webhookUrl    = process.env.INPUT_WEBHOOK_URL    || "";
const repository    = process.env.INPUT_REPOSITORY     || "unknown/repo";
const branch        = process.env.INPUT_BRANCH         || "unknown";
const author        = process.env.INPUT_AUTHOR         || "unknown";
const commitShaFull = process.env.INPUT_COMMIT_SHA     || "";
const commitMessage = process.env.INPUT_COMMIT_MESSAGE || "(no message)";
const status        = (process.env.INPUT_STATUS        || "success").toLowerCase();
const workflowName  = process.env.INPUT_WORKFLOW_NAME  || "GitHub Actions";

// ─── 2. Derived values ────────────────────────────────────────────────────────

const shortSha  = commitShaFull.slice(0, 7) || "0000000";
const repoUrl   = `https://github.com/${repository}`;
const branchUrl = `${repoUrl}/tree/${branch}`;
const commitUrl = `${repoUrl}/commit/${commitShaFull}`;

// ─── 3. Validate ──────────────────────────────────────────────────────────────

if (!webhookUrl) {
  console.error("❌ Error: webhook_url input is empty or not set.");
  console.error("   Make sure TEAMS_WEBHOOK_URL is saved in:");
  console.error("   GitHub → Settings → Secrets and variables → Actions");
  process.exit(1);
}

// ─── 4. Status-aware styling ──────────────────────────────────────────────────
// Each status gets a distinct emoji and label so the card is immediately
// recognisable in the Teams channel without opening the details.

const STATUS_CONFIG = {
  failure:   { emoji: "❌", label: "Build Failed",    color: "Attention" },
  success:   { emoji: "✅", label: "Build Passed",    color: "Good"      },
  cancelled: { emoji: "⚠️", label: "Build Cancelled", color: "Warning"   },
};

const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.success;

// ─── 5. Build the AdaptiveCard payload ───────────────────────────────────────
// Power Automate's "Post card in a chat or channel" action calls
// AdaptiveCard.FromJson() directly on the HTTP request body.
// The ROOT of the JSON must be the AdaptiveCard itself.

const payload = {
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  type: "AdaptiveCard",
  version: "1.4",

  body: [
    // ── Title row ────────────────────────────────────────────────────────────
    {
      type: "TextBlock",
      text: `${cfg.emoji} ${cfg.label} — ${workflowName}`,
      weight: "Bolder",
      size: "Large",
      color: cfg.color,
      wrap: true
    },
    // ── Key facts ─────────────────────────────────────────────────────────────
    {
      type: "FactSet",
      facts: [
        { title: "📁 Repository", value: repository    },
        { title: "🌿 Branch",     value: branch        },
        { title: "👤 Author",     value: author        },
        { title: "🔖 Commit",     value: shortSha      },
        { title: "💬 Message",    value: commitMessage },
        { title: "📊 Status",     value: `${cfg.emoji} ${cfg.label}` },
      ]
    }
  ],

  actions: [
    {
      type: "Action.OpenUrl",
      title: "View commit",
      url: commitUrl
    },
    {
      type: "Action.OpenUrl",
      title: "View repository",
      url: repoUrl
    },
    {
      type: "Action.OpenUrl",
      title: "View branch",
      url: branchUrl
    }
  ]
};

// ─── 6. Send ──────────────────────────────────────────────────────────────────

console.log("📨 Sending Teams notification...");
console.log(`   Workflow   : ${workflowName}`);
console.log(`   Status     : ${cfg.emoji} ${cfg.label}`);
console.log(`   Repository : ${repository}`);
console.log(`   Branch     : ${branch}`);
console.log(`   Author     : ${author}`);
console.log(`   Commit     : ${shortSha}`);
console.log(`   Message    : ${commitMessage}`);
// IMPORTANT: webhookUrl is intentionally NOT printed.

(async () => {
  let response;

  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (networkError) {
    console.error("❌ Network error while calling the Teams webhook:");
    console.error(`   ${networkError.message}`);
    process.exit(1);
  }

  // ─── 7. Handle response ────────────────────────────────────────────────────

  if (response.ok) {
    console.log(`✅ Teams webhook accepted the notification (HTTP ${response.status}).`);
  } else {
    let body = "";
    try {
      body = await response.text();
    } catch (_) {
      body = "(could not read response body)";
    }
    console.error(`❌ Teams webhook returned an error (HTTP ${response.status}).`);
    console.error(`   Response body: ${body}`);
    process.exit(1);
  }

})();