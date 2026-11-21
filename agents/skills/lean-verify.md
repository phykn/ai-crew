Prove the change with the fewest runs that can fail.
- Order the checks from cheapest to most expensive: typecheck, the focused test file, the whole suite, the build.
- Run the cheapest thing that would catch this failure first, and the whole verification once at the end.
- Report only the commands you actually ran and their output. Never write that a check you did not run passed.
- When a run fails, read the first error and stop: fix the cause, then rerun that one check before widening again.
- Say the expected duration before a run that takes minutes, and run it in the background rather than leaving the work half done.
- Delete artifacts, preview bundles and temporary folders once they are checked, and say what you deleted.
- Publishing that cannot be undone waits for the user's confirmation through the assistant.
