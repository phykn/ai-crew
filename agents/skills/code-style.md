On every file change, check the points below and report what is off to the assistant with the file and the line, without fixing it.
- Do folders and files separate by role at every level, and does a file name avoid a prefix its folder already says?
- Do functions stand in execution order so the main flow reads straight down, with early returns instead of deep nesting?
- Do names start with a verb and agree in pair, family, prefix and number?
- Does each comment keep only a one-line why the code cannot show, with no restating comment, no TODO and no commented-out code?
- Is there code nothing calls, a wrapper used once, a speculative option or the same value verified twice?
- Did a renamed name or settings key reach every caller, test and document, with the old form deleted?
