// Comment-based help inside PowerShell block comments (<# ... #>), injected into
// comment nodes by Queries/injections.scm so help keywords can be highlighted.

// Keywords are case-insensitive in PowerShell; tree-sitter regexes have no (?i).
function caseInsensitive(word) {
  return word.split('').map((c) => `[${c.toLowerCase()}${c.toUpperCase()}]`).join('');
}

const SECTION_KEYWORDS = [
  'SYNOPSIS', 'DESCRIPTION', 'EXAMPLE', 'INPUTS', 'OUTPUTS', 'NOTES', 'LINK',
  'COMPONENT', 'ROLE', 'FUNCTIONALITY',
];
// Keywords that take a name on the same line, e.g. .PARAMETER Path
const ARGUMENT_KEYWORDS = [
  'PARAMETER', 'FORWARDHELPTARGETNAME', 'FORWARDHELPCATEGORY', 'REMOTEHELPRUNSPACE', 'EXTERNALHELP',
];

function keywordToken(words) {
  // prec(1) wins the tie against `word`, which matches the same characters.
  return token(prec(1, new RegExp('\\.(' + words.map(caseInsensitive).join('|') + ')')));
}

module.exports = grammar({
  name: 'powershell_help',

  extras: () => [],

  conflicts: ($) => [[$.directive, $.text]],

  rules: {
    help: ($) => seq(optional($._line), repeat(seq($.newline, optional($._line)))),

    _line: ($) => choice($.directive, $.text),

    // A help keyword at the start of a line (after optional indentation).
    directive: ($) =>
      seq(
        optional($.space),
        choice(
          seq($.argument_keyword, optional(seq($.space, alias($.word, $.argument)))),
          $.section_keyword,
        ),
        optional($.text),
      ),

    section_keyword: () => keywordToken(SECTION_KEYWORDS),
    argument_keyword: () => keywordToken(ARGUMENT_KEYWORDS),

    text: ($) => repeat1(choice($.word, $.space)),

    word: () => /[^\s]+/,
    space: () => /[ \t]+/,
    newline: () => /\r?\n/,
  },
});
