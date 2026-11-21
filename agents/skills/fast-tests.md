Keep the suite fast enough that it runs on every change.
- Replace a heavy model with a small double that runs the same flow, and call main inside the process instead of spawning a subprocess for a script.
- Use the real model once only for what a double cannot show.
- Keep one strong test instead of several weak ones, and delete tests that overlap or no longer guard anything.
- One test file per source module, shared helpers in one file.
- When you fix a bug, leave one regression test that fails on the code before the fix.
- Test the rule, not the markup: assert the value the user would notice rather than the shape of the component tree.
- Keep the whole suite finishing in seconds, and when it slows down, start by shrinking the tests you just wrote.
- Report the command you ran and its result as they are, and never count a check you cannot run as a pass.
