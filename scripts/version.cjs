// The app's version: 1.<highest merged pull request number>.0, so the start screen says which PRs are
// in the build (1.37.0 = everything up to #37). Read from git history: GitHub's merge commits
// ("Merge pull request #37 from …") and squash merges ("Title (#37)"). The highest number, not the
// latest merge, so merging an older PR after a newer one never goes backwards.
// APP_VERSION in the environment wins; without git history it falls back to package.json's version.
// Usage: node scripts/version.cjs   (prints it), or require('./scripts/version.cjs').appVersion()
const { execSync } = require('child_process');

/** The highest PR number in these commit subjects, or null. */
function highestPr(subjects) {
    let best = null;
    for (const s of subjects) {
        const m = s.match(/^Merge pull request #(\d+)\b/) || s.match(/\(#(\d+)\)\s*$/);
        if (m) best = Math.max(best ?? 0, Number(m[1]));
    }
    return best;
}

function appVersion() {
    if (process.env.APP_VERSION) return process.env.APP_VERSION;
    try {
        const log = execSync('git log --format=%s', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        const pr = highestPr(log.split('\n'));
        if (pr !== null) return `1.${pr}.0`;
    } catch {
        // no git (e.g. a downloaded zip): fall through
    }
    return require('../package.json').version;
}

module.exports = { appVersion, highestPr };

if (require.main === module) console.log(appVersion());
