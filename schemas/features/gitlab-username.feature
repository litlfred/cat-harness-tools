# Specifies GitLabUsernameSchema (schemas/tools/tool-types.ts): a GitLab
# account name that is safe as a command-line argument.
Feature: A GitLab username is a GitLab account name safe on the command line

  @test:schemas/gitlab-username.test.ts::GitLabUsername:_a_GitLab_account_name,_safe_on_the_command_line_(4dbr)::GitLab's_shapes_parse,_including_ones_Login_refuses
  Scenario: GitLab's username shapes parse, including ones a GitHub login refuses
    Given usernames "litlfred", "jane.doe", "_bot", "ci_runner-2", "a" and a 255-character name
    When each is parsed as a GitLab username
    Then each parses
    And "jane.doe" is refused as a login

  @test:schemas/gitlab-username.test.ts::GitLabUsername:_a_GitLab_account_name,_safe_on_the_command_line_(4dbr)::a_flag,_a_shell_payload,_whitespace_or_GitLab's_forbidden_endings_do_not_parse
  Scenario: Flags, shell payloads, whitespace and forbidden endings are refused
    Given values such as "-rf", "--reviewer", ".hidden", "trailing.", "repo.git", "feed.atom", "a b", "a;rm", "$(x)", "+jane", the empty string and a 256-character name
    When each is parsed as a GitLab username
    Then each is refused

  @test:schemas/gitlab-username.test.ts::GitLabUsername:_a_GitLab_account_name,_safe_on_the_command_line_(4dbr)::it_is_admissible_as_a_command-line_argument
  Scenario: GitLabUsername is admissible as a command-line argument
    Given the tool type "GitLabUsername"
    When it is checked for injection safety
    Then it is safe
