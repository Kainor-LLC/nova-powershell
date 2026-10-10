// Snippet completions. Bodies use the snippet format (${1:placeholder}, $0); every other
// "$" is a literal PowerShell sigil and is escaped automatically.

const SNIPPETS = [
    {
        prefix: "function",
        description: "Advanced function with help, CmdletBinding, and begin/process/end",
        body: `function \${1:Verb-Noun} {
\t<#
\t.SYNOPSIS
\t\t\${2:Short description}
\t.DESCRIPTION
\t\t\${3:Long description}
\t.PARAMETER \${4:Name}
\t\t\${5:Parameter description}
\t.EXAMPLE
\t\t\${1:Verb-Noun} -\${4:Name} \${6:Value}
\t#>
\t[CmdletBinding()]
\tparam(
\t\t[Parameter(Mandatory, ValueFromPipeline)]
\t\t[\${7:string}]
\t\t$\${4:Name}
\t)

\tbegin {
\t}

\tprocess {
\t\t$0
\t}

\tend {
\t}
}`,
    },
    {
        prefix: "func",
        description: "Simple function with a param block",
        body: `function \${1:Verb-Noun} {
\tparam(
\t\t$\${2:Parameter}
\t)

\t$0
}`,
    },
    {
        prefix: "filter",
        description: "Filter",
        body: `filter \${1:Name} {
\t$0
}`,
    },
    {
        prefix: "param",
        description: "Parameter block with a mandatory parameter",
        body: `param(
\t[Parameter(Mandatory)]
\t[\${1:string}]
\t$\${2:Name}
)`,
    },
    {
        prefix: "parameter",
        description: "Parameter declaration",
        body: `[Parameter(\${1:Mandatory})]
[\${2:string}]
$\${3:Name}`,
    },
    {
        prefix: "help",
        description: "Comment-based help block",
        body: `<#
.SYNOPSIS
\t\${1:Short description}
.DESCRIPTION
\t\${2:Long description}
.PARAMETER \${3:Name}
\t\${4:Parameter description}
.EXAMPLE
\t\${5:Example}
#>`,
    },
    {
        prefix: "if",
        description: "if statement",
        body: `if (\${1:condition}) {
\t$0
}`,
    },
    {
        prefix: "ifelse",
        description: "if/else statement",
        body: `if (\${1:condition}) {
\t\${2}
}
else {
\t$0
}`,
    },
    {
        prefix: "elseif",
        description: "elseif clause",
        body: `elseif (\${1:condition}) {
\t$0
}`,
    },
    {
        prefix: "switch",
        description: "switch statement",
        body: `switch ($\${1:value}) {
\t\${2:pattern} { \${3} }
\tdefault { $0 }
}`,
    },
    {
        prefix: "foreach",
        description: "foreach loop",
        body: `foreach ($\${1:item} in $\${2:collection}) {
\t$0
}`,
    },
    {
        prefix: "for",
        description: "for loop",
        body: `for ($\${1:i} = 0; $\${1:i} -lt \${2:count}; $\${1:i}++) {
\t$0
}`,
    },
    {
        prefix: "while",
        description: "while loop",
        body: `while (\${1:condition}) {
\t$0
}`,
    },
    {
        prefix: "dountil",
        description: "do/until loop (runs until the condition is true)",
        body: `do {
\t$0
} until (\${1:condition})`,
    },
    {
        prefix: "dowhile",
        description: "do/while loop (runs while the condition is true)",
        body: `do {
\t$0
} while (\${1:condition})`,
    },
    {
        prefix: "try",
        description: "try/catch/finally",
        body: `try {
\t$0
}
catch {
\t\${1:Write-Error $_}
}
finally {
\t\${2}
}`,
    },
    {
        prefix: "trycatch",
        description: "try/catch",
        body: `try {
\t$0
}
catch {
\t\${1:Write-Error $_}
}`,
    },
    {
        prefix: "class",
        description: "Class with a property, constructor, and method",
        body: `class \${1:Name} {
\t[\${2:string}] $\${3:Property}

\t\${1:Name}() {
\t}

\t[\${4:void}] \${5:Method}() {
\t\t$0
\t}
}`,
    },
    {
        prefix: "enum",
        description: "Enum",
        body: `enum \${1:Name} {
\t\${2:Value1}
\t\${3:Value2}
}`,
    },
    {
        prefix: "region",
        description: "#region / #endregion",
        body: `#region \${1:Name}
$0
#endregion`,
    },
    {
        prefix: "splat",
        description: "Splat a hashtable of parameters into a command",
        body: `$\${1:params} = @{
\t\${2:Name} = \${3:Value}
}
\${4:Command} @\${1:params}`,
    },
    {
        prefix: "pscustomobject",
        description: "[PSCustomObject] literal",
        body: `[PSCustomObject]@{
\t\${1:Name} = \${2:Value}
}`,
    },
    {
        prefix: "shouldprocess",
        description: "ShouldProcess check for -WhatIf/-Confirm support",
        body: `if ($PSCmdlet.ShouldProcess(\${1:target}, \${2:action})) {
\t$0
}`,
    },
    {
        prefix: "Describe",
        description: "Pester Describe block",
        body: `Describe '\${1:Subject}' {
\tIt '\${2:does something}' {
\t\t$0
\t}
}`,
    },
    {
        prefix: "Context",
        description: "Pester Context block",
        body: `Context '\${1:when something}' {
\t$0
}`,
    },
    {
        prefix: "It",
        description: "Pester test case",
        body: `It '\${1:does something}' {
\t\${2:$actual} | Should -Be \${3:expected}
}`,
    },
    {
        prefix: "BeforeAll",
        description: "Pester setup that runs once per block",
        body: `BeforeAll {
\t. $PSScriptRoot/\${1:Script}.ps1
}`,
    },
    {
        prefix: "BeforeEach",
        description: "Pester setup that runs before each test",
        body: `BeforeEach {
\t$0
}`,
    },
    {
        prefix: "AfterAll",
        description: "Pester teardown that runs once per block",
        body: `AfterAll {
\t$0
}`,
    },
    {
        prefix: "AfterEach",
        description: "Pester teardown that runs after each test",
        body: `AfterEach {
\t$0
}`,
    },
    {
        prefix: "Mock",
        description: "Pester mock",
        body: `Mock \${1:Command} { \${2:return value} }`,
    },
];

// Escape "$" unless it starts a tab stop ($1, $0) or placeholder (${...}).
function toSnippet(body) {
    return body.replace(/\$(?![{\d])/g, "\\$");
}

function snippetKind() {
    if (typeof CompletionItemKind === "undefined") {
        return undefined;
    }
    return CompletionItemKind.Snippet ?? CompletionItemKind.Keyword ?? CompletionItemKind.Function;
}

class SnippetCompletionAssistant {
    constructor() {
        this.loggedFirstRequest = false;
    }

    provideCompletionItems(editor, context) {
        if (!this.loggedFirstRequest) {
            console.log("PowerShell snippets: completion requested");
            this.loggedFirstRequest = true;
        }

        const typed = (context.text || "").toLowerCase();
        if (!typed) {
            return [];
        }

        // Don't offer statement snippets inside strings or comments.
        const scopes = (context.selectors || []).map((s) => String(s.string ?? s)).join(" ");
        if (/\b(string|comment)\b/.test(scopes)) {
            return [];
        }

        const kind = snippetKind();
        return SNIPPETS
            .filter((snippet) => snippet.prefix.toLowerCase().startsWith(typed))
            .map((snippet) => {
                const item = new CompletionItem(snippet.prefix, kind);
                item.detail = snippet.description;
                item.documentation = snippet.body.replace(/\$\{\d+:?([^}]*)\}/g, "$1").replace(/\$\d/g, "");
                item.insertText = toSnippet(snippet.body);
                item.insertTextFormat = InsertTextFormat.Snippet;
                return item;
            });
    }
}

exports.SNIPPETS = SNIPPETS;
exports.toSnippet = toSnippet;

exports.register = function () {
    return nova.assistants.registerCompletionAssistant("powershell", new SnippetCompletionAssistant());
};
