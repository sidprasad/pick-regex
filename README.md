# pick README

1. Asks user for prompt -> Generates ~4 candidate regular expressions.
2. Then, uses regexAnalyzer to keep generating pairs of distinguishing words between these regular expressions. Users will have to accept / reject these (2 at a time), till
THRESHOLD_NUMBER (default 2) decisions remove each regex.
3. Basically this helps thresh the number of potential regexes til 1 is left.
4. Then, show words IN and OUT of the regex, until we establish it is the correct one (at least one positive classification for it) OR all are eliminated. If all are eliminated -- need to let users know.
5. Never repeat words in classification.
