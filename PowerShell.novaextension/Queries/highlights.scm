; PowerShell highlights for Nova.
; General captures first; more specific patterns later override them.

; Comments

(comment) @comment

; Directives

(requires_keyword) @processing

; Literals

(string_literal) @string
(integer_literal) @value.number
(real_literal) @value.number

; Variables

(variable) @identifier.variable

((variable) @value.boolean
 (#match? @value.boolean "^\\$(?i:true|false)$"))

((variable) @value.null
 (#match? @value.null "^\\$(?i:null)$"))

((variable) @keyword.self
 (#match? @keyword.self "^\\$(?i:this)$"))

((variable) @identifier.global
 (#match? @identifier.global "^\\$(?i:env|global|script|using):"))

((variable) @identifier.core
 (#match? @identifier.core "^\\$(_|\\?|\\^|\\$|(?i:args|input|psitem|psscriptroot|pscommandpath|pscmdlet|psboundparameters|myinvocation|matches|lastexitcode|error|host|home|pwd|profile|psversiontable|pshome|ismacos|islinux|iswindows|iscoreclr))$"))

; Interpolation inside expandable strings

(expandable_string_literal (variable) @string-template.value)
(expandable_here_string_literal (variable) @string-template.value)

; Types and attributes

(type_identifier) @identifier.type
(type_literal "[" @bracket "]" @bracket)

(attribute
  (attribute_name
    (type_spec (type_name (type_identifier) @identifier.decorator))))

(attribute_argument (simple_name) @identifier.argument)

; Commands

(command
  command_name: (command_name) @identifier.function)

(command_elements (command_parameter) @identifier.argument)

(command_invocation_operator) @operator

(generic_token) @string.unquoted

(escape_character) @regex.escaped

(requires_argument (command_parameter) @processing)

; Functions and classes

(function_statement (function_name) @identifier.function)

(class_statement . (simple_name) @identifier.type.class)

(class_method_definition (simple_name) @identifier.method)
(class_property_definition (variable) @identifier.property)

(class_method_base_ctor [ "base" "this" ] @keyword.self)

(enum_statement (simple_name) @identifier.type.enum)
(enum_member (simple_name) @identifier.constant)

; Members

(member_access (member_name (simple_name) @identifier.property))
(invocation_expression (member_name (simple_name) @identifier.method))

; Hashtables

(hash_entry (key_expression (simple_name) @identifier.key))
(hash_entry (key_expression (unary_expression (string_literal) @string.key)))

; Labels

(label) @identifier.label
(label_name) @identifier.label

; Keywords

[
  "function"
  "filter"
  "workflow"
  "class"
  "enum"
  "param"
  "dynamicparam"
] @keyword.construct

[
  "if"
  "elseif"
  "else"
  "switch"
] @keyword.condition

[
  "foreach"
  "for"
  "while"
  "do"
  "until"
  "in"
  "break"
  "continue"
  "return"
  "exit"
  "throw"
  "trap"
  "try"
  "catch"
  "finally"
  "data"
  "parallel"
  "sequence"
  "inlinescript"
] @keyword

[
  "begin"
  "process"
  "end"
  "clean"
] @keyword

[
  "using"
  "namespace"
  "module"
  "assembly"
] @keyword

[
  "hidden"
  "static"
] @keyword.modifier

(switch_parameter) @keyword.modifier
(foreach_parameter) @keyword.modifier

; Operators

(comparison_operator) @keyword.operator
(format_operator) @keyword.operator

[
  "-and"
  "-or"
  "-xor"
  "-not"
  "-band"
  "-bor"
  "-bxor"
  "-bnot"
  "-split"
  "-join"
] @keyword.operator

(assignment_operator) @operator
(pipeline_chain_tail) @operator

(ternary_expression [ "?" ":" ] @operator)
(null_coalesce_expression "??" @operator)

[
  "+"
  "-"
  "*"
  "/"
  "\\"
  "%"
  "!"
  ".."
  "++"
  "--"
  "|"
  "::"
] @operator

(file_redirection_operator) @operator
(merging_redirection_operator) @operator

; Punctuation

[ "(" ")" "[" "]" "{" "}" "@(" "@{" "$(" ] @bracket
[ ";" "," ] @punctuation.delimiter

; Interpolation delimiters inside strings (after brackets so they win)

(expandable_string_literal (sub_expression "$(" @string-template ")" @string-template))
(expandable_here_string_literal (sub_expression "$(" @string-template ")" @string-template))
