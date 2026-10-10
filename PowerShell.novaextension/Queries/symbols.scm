; PowerShell symbols for Nova (Symbols sidebar, jump to symbol).

((function_statement
  (function_name) @name) @subtree
 (#set! role function))

((class_statement
  . (simple_name) @name) @subtree
 (#set! role class))

((class_method_definition
  (simple_name) @name) @subtree
 (#set! role method))

((class_property_definition
  (variable) @name) @subtree
 (#set! role property))

((enum_statement
  (simple_name) @name) @subtree
 (#set! role enum))

((enum_member
  (simple_name) @name) @subtree
 (#set! role enum-member))

; #region markers become headings in the Symbols sidebar

((comment) @name @subtree
 (#match? @name "^#(?i:region)\\b")
 (#set! role bookmark))
