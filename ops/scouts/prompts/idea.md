## What you have proposed before

{{HISTORY}}

Learn from that list: lean toward the kind of thing that was merged, away from the kind that was closed without merging, and never repeat any of them.

## Your answer

Pick ONE idea, or none. It is far better to say "nothing worth building this week" than to propose something marginal — every proposal becomes a pull request Jared has to read.

The idea must be buildable in one small change, inside these limits (they are enforced after the build, not just requested):
- only files under `web/src/` and `web/e2e/` may change; not `firestoreService.js`, not `context/`, not `AdminView.jsx`, not `LoginView.jsx`, not `package.json`;
- at most 12 files and 700 changed lines; no deleted files; no new dependencies;
- every new calculation is a pure function in `web/src/services/` with a `*.test.js` beside it.

You are read-only in this step: do not edit anything.

Answer with:
- `skip`: true if nothing is worth building this week (then `reason` says why, and the rest may be empty);
- `title`: under 70 characters, plain English, no jargon — it becomes the pull request title;
- `problem`: what a member sees or cannot do today, in two or three sentences, naming the page;
- `proposal`: what to build, concretely;
- `files`: the files you expect to touch or create;
- `acceptance`: three to five checks that would prove it works, each one something a test or a screenshot can show.
