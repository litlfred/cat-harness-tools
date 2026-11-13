# Specifies RouteMemberSchema and KeyedBySchema (schemas/kg/subgraph-source.ts)
# and the keyedBy field of directory storage (schemas/kg/cat-harness.ts).
Feature: A route-family member is one safe path segment, and the keying enum has one definition

  @test:schemas/route-member.test.ts::a_route-family_member_is_one_safe_path_segment::ordinary_branch-derived_slugs_pass
  Scenario: Ordinary branch-derived slugs are members
    Given "claude-xp5j-ref-steward", "main", "pr-2063", "v1.2.3", "a" and "A_b-c.d"
    When each is parsed as a route member
    Then each parses

  @test:schemas/route-member.test.ts::a_route-family_member_is_one_safe_path_segment::ONE_segment:_a_slash_is_refused,_which_kills_traversal_in_a_single_rule
  Scenario: Anything with a slash or a traversal is refused
    Given "a/b", "../etc", "..", "../../index.html", "/absolute", "a//b", "STAGING/x", "x/.." and "./x"
    When each is parsed as a route member
    Then each is refused

  @test:schemas/route-member.test.ts::a_route-family_member_is_one_safe_path_segment::no_dot-prefixed_segment_—_the_directory-conventions_guard
  Scenario: A dot-prefixed member is refused
    Given ".git", ".beans", ".hidden", ".." and "."
    When each is parsed
    Then each is refused

  @test:schemas/route-member.test.ts::a_route-family_member_is_one_safe_path_segment::a_dash-leading_key_is_refused,_so_a_member_cannot_be_read_as_a_flag
  Scenario: A dash-leading member is refused
    Given "-rf", "--force" and "-"
    When each is parsed
    Then each is refused

  @test:schemas/route-member.test.ts::a_route-family_member_is_one_safe_path_segment::empty_and_oversized_are_refused
  Scenario: Members are 1 to 100 characters long
    Given the empty string, 100 characters and 101 characters
    When each is parsed
    Then only the 100-character member parses

  @test:schemas/route-member.test.ts::a_route-family_member_is_one_safe_path_segment::characters_that_mean_something_to_a_shell_or_a_URL_are_refused
  Scenario: Shell and URL metacharacters are refused
    Given members containing a space, ; & | $ backtick quote double-quote > newline NUL %-escape ? # : or backslash
    When each is parsed
    Then each is refused

  @test:schemas/route-member.test.ts::a_route-family_member_is_one_safe_path_segment::a_dot_INSIDE_is_fine,_but_never_two_in_a_row
  Scenario: An inner dot is fine but two in a row are not
    Given "v1.2.3" and "a..b"
    When each is parsed
    Then the first parses and the second is refused

  @test:schemas/route-member.test.ts::the_keying_enum_carries_exactly_four_values::route-family_parses,_and_an_undeclared_fifth_does_not
  Scenario: Branch storage takes four keyings and refuses others
    Given storage on branch "gh-pages"
    When keyedBy is commit, tip, route or route-family
    Then it parses
    And keyedBy "routes", "family", "route_family", "dynamic" or empty is refused
    # Gap: the describe says the enum has exactly four values, but another test in this file shows "family" is in the enum; this test only shows branch-keyed storage refuses it.

  @test:schemas/route-member.test.ts::the_keying_enum_carries_exactly_four_values::the_branch_it_names_is_still_validated
  Scenario: A route-family storage still validates its branch
    Given keyedBy "route-family" with branches "refs/heads/gh-pages", "-x", "a..b", "a//b", "gh-pages/", "x.lock" and "/abs"
    When each is parsed
    Then each is refused

  @test:schemas/route-member.test.ts::the_keying_enum_has_exactly_one_definition::every_accepted_value_is_accepted_by_BOTH
  Scenario: Every accepted keying is accepted by the enum and by branch storage
    Given the keyings commit, tip, route and route-family
    When each is parsed by the keying enum and as branch storage's keyedBy
    Then both accept it

  @test:schemas/route-member.test.ts::the_keying_enum_has_exactly_one_definition::`family`_is_in_the_one_enum,_and_the_declaration_takes_it_in_its_OWN_shape
  Scenario: The family keying is accepted only in its own storage shape
    Given the keying "family"
    When it is parsed by the keying enum
    Then it parses
    And storage with a branchPrefix, keyedBy "family" and keyFrom parses
    And branch storage with keyedBy "family" is refused

  @test:schemas/route-member.test.ts::the_keying_enum_has_exactly_one_definition::every_rejected_value_is_rejected_by_BOTH_—_the_direction_`1j3q`_missed
  Scenario: Every refused keying is refused by both
    Given the empty string, "routes", "famly", "route_family", "dynamic", "ROUTE" and "tip "
    When each is parsed by the keying enum and as branch storage's keyedBy
    Then both refuse it

  @test:schemas/route-member.test.ts::the_keying_enum_has_exactly_one_definition::the_declaration_does_not_RESTATE_the_enum_—_it_is_the_same_schema_object
  Scenario: Directory storage uses the keying enum object itself
    Given the directory storage schema's shape
    When its keyedBy field is read
    Then it is the keying enum schema object itself
