# Specifies ReviewThreadIdSchema (schemas/tools/tool-types.ts): a forge's
# review-thread id that is safe as a command-line argument.
Feature: A review-thread id is a forge's thread id safe on the command line

  @test:schemas/review-thread-id.test.ts::ReviewThreadId:_a_forge's_review-thread_id,_safe_on_the_command_line_(4dbr)::both_forges'_shapes_parse
  Scenario: GitHub and GitLab thread ids parse
    Given a GitHub review-thread node id, a 40-hex GitLab discussion id, an 8-character prefix and a GitLab note id
    When each is parsed as a review-thread id
    Then each parses

  @test:schemas/review-thread-id.test.ts::ReviewThreadId:_a_forge's_review-thread_id,_safe_on_the_command_line_(4dbr)::a_flag,_a_shell_payload,_whitespace_or_a_too-short_prefix_does_not_parse
  Scenario: Flags, shell payloads, whitespace and short prefixes are refused
    Given values such as "-rf", "--help-me-now", "abc1234;rm", "$(touch x)", "abc 12345", a backticked value, "abc123", the empty string and a 129-character value
    When each is parsed
    Then each is refused

  @test:schemas/review-thread-id.test.ts::ReviewThreadId:_a_forge's_review-thread_id,_safe_on_the_command_line_(4dbr)::it_is_admissible_as_a_command-line_argument
  Scenario: ReviewThreadId is admissible as a command-line argument
    Given the tool type "ReviewThreadId"
    When it is checked for injection safety
    Then it is safe
