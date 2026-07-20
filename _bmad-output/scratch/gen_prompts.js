const fs = require('fs');
const path = require('path');

const diffPath = path.join(__dirname, 'review_diff.diff');
const outputDir = path.join(__dirname, '..', 'implementation-artifacts');

if (!fs.existsSync(diffPath)) {
  console.error("Diff file not found at " + diffPath);
  process.exit(1);
}

const diffContent = fs.readFileSync(diffPath, 'utf8');

// 1. Blind Hunter
const promptBlindHunter = `Invoke the \`bmad-review-adversarial-general\` skill on this diff:

\`\`\`diff
${diffContent}
\`\`\`
`;
fs.writeFileSync(path.join(outputDir, 'prompt-blind-hunter.md'), promptBlindHunter, 'utf8');
console.log("Created prompt-blind-hunter.md");

// 2. Edge Case Hunter
const promptEdgeCaseHunter = `Invoke the \`bmad-review-edge-case-hunter\` skill on this diff:

\`\`\`diff
${diffContent}
\`\`\`
`;
fs.writeFileSync(path.join(outputDir, 'prompt-edge-case-hunter.md'), promptEdgeCaseHunter, 'utf8');
console.log("Created prompt-edge-case-hunter.md");

// 3. Verification Gap
const promptVerificationGap = `Invoke the \`bmad-review-verification-gap\` skill on this diff:

\`\`\`diff
${diffContent}
\`\`\`
`;
fs.writeFileSync(path.join(outputDir, 'prompt-verification-gap.md'), promptVerificationGap, 'utf8');
console.log("Created prompt-verification-gap.md");

// 4. Acceptance Auditor
const specFile = 'c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/SPEC.md';
const promptAcceptanceAuditor = `You are an Acceptance Auditor. Review the provided diff against \`${specFile}\` and any loaded context docs. Check for: violations of acceptance criteria, deviations from spec intent, missing implementation of specified behavior, contradictions between spec constraints and actual code. Output findings as a Markdown list. Each finding: one-line title, which AC/constraint it violates, and evidence from the diff.

Loaded context docs:
1. \`_bmad-output/implementation-artifacts/1-1-initialize-extension-package-and-storage-configuration.md\`
2. \`_bmad-output/implementation-artifacts/1-2-implement-content-script-for-real-time-comment-extraction.md\`
3. \`_bmad-output/implementation-artifacts/1-3-implement-offscreen-document-for-local-server-forwarding.md\`

Diff:
\`\`\`diff
${diffContent}
\`\`\`
`;
fs.writeFileSync(path.join(outputDir, 'prompt-acceptance-auditor.md'), promptAcceptanceAuditor, 'utf8');
console.log("Created prompt-acceptance-auditor.md");
