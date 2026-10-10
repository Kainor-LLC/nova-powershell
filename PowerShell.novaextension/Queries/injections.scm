; Block comments hold comment-based help (.SYNOPSIS, .PARAMETER, ...).

((comment) @injection.content
 (#match? @injection.content "^<#")
 (#set! injection.language "powershell_help"))
