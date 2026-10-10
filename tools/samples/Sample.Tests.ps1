# Sample Pester tests. Run with the "Run Pester Tests" task (requires Pester 5+:
#   Install-Module Pester -Scope CurrentUser).
# One test fails on purpose so you can see failures reported in the Issues sidebar.

Describe 'Math' {
    It 'adds numbers' {
        1 + 1 | Should -Be 2
    }

    It 'fails on purpose' {
        1 + 1 | Should -Be 3
    }
}