; PowerShell code folding for Nova.

((function_statement "{" @start "}" @end)
 (#set! role function))

((class_statement "{" @start "}" @end)
 (#set! role type))

((class_method_definition "{" @start "}" @end)
 (#set! role function))

((enum_statement "{" @start "}" @end)
 (#set! role type))

((statement_block "{" @start "}" @end)
 (#set! role block))

((script_block_expression "{" @start "}" @end)
 (#set! role block))

((switch_body "{" @start "}" @end)
 (#set! role block))

((param_block "(" @start ")" @end)
 (#set! role block))

((hash_literal_expression "@{" @start "}" @end)
 (#set! role block))

((array_expression "@(" @start ")" @end)
 (#set! role block))

((argument_list "(" @start ")" @end)
 (#set! role block))

; Block comments and comment-based help: <# ... #>

((comment) @subtree
 (#match? @subtree "^<#")
 (#set! role comment))

; Here-strings

((expandable_here_string_literal) @subtree
 (#set! role block))

((verbatim_here_string_characters) @subtree
 (#set! role block))

; #region / #endregion

((comment) @start
 (#match? @start "^#(?i:region)\\b")
 (#set! role heading)
 (#set! scope.group region))

((comment) @end
 (#match? @end "^#(?i:endregion)\\b")
 (#set! scope.group region))
