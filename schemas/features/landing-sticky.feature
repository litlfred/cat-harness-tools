# Specifies landing stickies (schemas/content/landing-sticky.ts) and the
# sticky contributions each layer declares (schemas/content/sticky-contribution.ts):
# cards on the landing page, contributed per layer, ordered by declaration,
# page-global by type, with links that resolve.
Feature: Each layer contributes its own landing sticky, ordered, themed and linked as it declares

  @test:schemas/landing-sticky.test.ts::a_published_card_id_does_not_move_with_its_directory::the_declarations_are_actually_being_read_—_not_an_empty_sweep
  Scenario: The real declarations of bootstrap, cat-harness and core are read
    Given the stickies declared by bootstrap, cat-harness and folio-assistant-core
    When their directory and id pairs are collected
    Then there are at least three

  @test:schemas/landing-sticky.test.ts::a_published_card_id_does_not_move_with_its_directory::EXACTLY_the_known_divergence,_named_—_collapsing_it_turns_this_red
  Scenario: Only folio-assistant-core's card id differs from its directory
    Given the same pairs
    When those whose id differs from the directory are listed
    Then the list is exactly folio-assistant-core

  @test:schemas/landing-sticky.test.ts::a_published_card_id_does_not_move_with_its_directory::...and_every_other_instance's_card_id_DOES_match,_which_is_the_contrast
  Scenario: bootstrap's and cat-harness's card ids match their directories
    Given the same pairs
    When those whose id equals the directory are listed
    Then the list is bootstrap and cat-harness

  @test:schemas/landing-sticky.test.ts::a_sticky_is_a_CONTRIBUTION_from_a_layer,_not_an_entry_in_one_list::cat-harness_contributes_its_own,_and_bootstrap_contributes_its_own
  Scenario: cat-harness and bootstrap each contribute their own stickies
    Given the contributions read from each layer's declaration
    When they are counted and their declaring layer read
    Then each layer contributes at least one, all declared by that layer

  @test:schemas/landing-sticky.test.ts::a_sticky_is_a_CONTRIBUTION_from_a_layer,_not_an_entry_in_one_list::the_built_sticky_records_which_layer_contributed_it
  Scenario: A built sticky records the layer that contributed it
    Given the built bootstrap and cat-harness stickies
    When their contributor is read
    Then each names its own layer

  @test:schemas/landing-sticky.test.ts::a_sticky_is_a_CONTRIBUTION_from_a_layer,_not_an_entry_in_one_list::no_layer's_declaration_names_another_layer's_sticky
  Scenario: bootstrap declares no sticky id that cat-harness declares
    Given the sticky ids of cat-harness and of bootstrap
    When they are compared
    Then no bootstrap id is a cat-harness id

  @test:schemas/landing-sticky.test.ts::bootstrap_has_its_OWN_cat,_not_cat-harness's::bootstrap_declares_a_theme,_and_it_is_not_the_one_cat-harness_uses
  Scenario: bootstrap's sticky theme is not one of cat-harness's
    Given bootstrap's contributions and the themes of cat-harness's contributions
    When each bootstrap theme is looked up among cat-harness's
    Then bootstrap contributes at least one and none is found
    # Gap: the themes are objects compared by reference in a Set, so the lookup can never succeed; the test passes even if both layers name the same themeId.

  @test:schemas/landing-sticky.test.ts::bootstrap_has_its_OWN_cat,_not_cat-harness's::its_theme_resolves_to_its_OWN_art,_not_the_default_cloud's
  Scenario: bootstrap's theme resolves to bootstrap's own art
    Given each bootstrap contribution's theme and the images cat-harness declares
    When the theme's backdrop is resolved
    Then it is a known theme with a backdrop of three crops, each from bootstrap's art

  @test:schemas/landing-sticky.test.ts::bootstrap_has_its_OWN_cat,_not_cat-harness's::the_schema_gives_`theme`_no_default,_so_a_layer_cannot_inherit_a_cat_by_silence
  Scenario: A sticky contribution must name its theme
    Given a contribution with id, order and body but no theme
    When it is parsed
    Then it throws

  @test:schemas/landing-sticky.test.ts::bootstrap_has_its_OWN_cat,_not_cat-harness's::every_backdrop_role_a_theme_names_has_all_three_crops,_or_it_serves_none
  Scenario: Every backdrop a used theme names is complete
    Given every theme any layer's sticky uses that has a backdrop
    When its backdrop is resolved against the declared images
    Then no crop is missing

  @test:schemas/landing-sticky.test.ts::order_is_DECLARED,_not_inherited_from_dependency_resolution::the_description_comes_first_and_bootstrap's_card_comes_last
  Scenario: The description card comes first and bootstrap's last
    Given the contributions of bootstrap, core and cat-harness
    When they are composed and built
    Then the first sticky is cat-harness and the last is bootstrap

  @test:schemas/landing-sticky.test.ts::order_is_DECLARED,_not_inherited_from_dependency_resolution::the_order_survives_the_layers_being_read_in_the_other_sequence
  Scenario: The order does not depend on the order layers are read
    Given the contributions read in two different sequences
    When each is built
    Then the sticky ids come out in the same order

  @test:schemas/landing-sticky.test.ts::order_is_DECLARED,_not_inherited_from_dependency_resolution::a_tie_breaks_on_layer_then_id,_so_the_board_is_never_read-order_dependent
  Scenario: Equal orders break on layer then id
    Given three contributions of order 50 from b-layer/zebra, a-layer/yak and a-layer/ant
    When they are composed
    Then the order is a-layer/ant, a-layer/yak, b-layer/zebra

  @test:schemas/landing-sticky.test.ts::order_is_DECLARED,_not_inherited_from_dependency_resolution::bootstrap_declares_the_trailing_order,_and_it_is_the_shared_constant
  Scenario: bootstrap trails and cat-harness leads by the shared constants
    Given bootstrap's and cat-harness's contributions
    When their orders are read
    Then bootstrap's only order is the trailing constant
    And cat-harness's first is the leading constant

  @test:schemas/landing-sticky.test.ts::two_layers_cannot_claim_one_sticky_id::a_duplicate_is_REFUSED_rather_than_letting_the_last_writer_win
  Scenario: Two layers claiming one sticky id are refused
    Given layers one and two each contributing id "landing"
    When they are composed
    Then a sticky id conflict is thrown

  @test:schemas/landing-sticky.test.ts::two_layers_cannot_claim_one_sticky_id::the_error_names_both_layers,_so_the_reader_knows_where_to_look
  Scenario: The id conflict names both layers
    Given layers alpha and beta each contributing id "landing"
    When they are composed
    Then the conflict message names alpha and beta

  @test:schemas/landing-sticky.test.ts::two_layers_cannot_claim_one_sticky_id::the_live_board_has_no_duplicate
  Scenario: The live board has no duplicate id
    Given every live contribution
    When they are composed
    Then nothing throws

  @test:schemas/landing-sticky.test.ts::`body`_and_`bodyFrom`_are_exclusive_—_both_is_a_contradiction,_neither_has_no_words::both_is_refused
  Scenario: A contribution with both body and bodyFrom is refused
    Given a contribution with a body and bodyFrom "description"
    When it is parsed
    Then it throws

  @test:schemas/landing-sticky.test.ts::`body`_and_`bodyFrom`_are_exclusive_—_both_is_a_contradiction,_neither_has_no_words::neither_is_refused
  Scenario: A contribution with neither body nor bodyFrom is refused
    Given a contribution with no body and no bodyFrom
    When it is parsed
    Then it throws

  @test:schemas/landing-sticky.test.ts::`body`_and_`bodyFrom`_are_exclusive_—_both_is_a_contradiction,_neither_has_no_words::a_misspelled_key_is_refused_rather_than_silently_dropped
  Scenario: A misspelt key is refused
    Given a contribution with an extra key onboardingLink
    When it is parsed
    Then it throws

  @test:schemas/landing-sticky.test.ts::`bodyFrom`_reads_the_DECLARING_layer's_fields::bootstrap's_card_carries_bootstrap's_sentence,_not_this_instance's
  Scenario: bootstrap's card carries bootstrap's own description
    Given the built bootstrap sticky
    When its comment is read
    Then it starts with bootstrap's description and not cat-harness's

  @test:schemas/landing-sticky.test.ts::`bodyFrom`_reads_the_DECLARING_layer's_fields::this_instance's_card_carries_its_summary_and_its_spellings,_the_landing's_text
  Scenario: cat-harness's card carries its reader text, summary and spellings
    Given the built cat-harness sticky
    When its comment is read
    Then it starts with the reader text and the summary
    And it lists "Also written:" with caaat-harness, ca&at-harness and c@t-harness in backticks, over more than one line

  @test:schemas/landing-sticky.test.ts::`bodyFrom`_reads_the_DECLARING_layer's_fields::an_instance_with_no_description_falls_back_to_its_NAME_rather_than_failing
  Scenario: A layer with no description falls back to its name
    Given a bodyFrom-description contribution from a layer with no description
    When the sticky is built
    Then its comment is the layer's name

  @test:schemas/landing-sticky.test.ts::`bodyFrom`_reads_the_DECLARING_layer's_fields::a_whitespace-only_description_falls_back_too
  Scenario: A blank description falls back to the name
    Given a bodyFrom-description contribution from a layer whose description is whitespace
    When the sticky is built
    Then its comment is the layer's name

  @test:schemas/landing-sticky.test.ts::it_is_page-global_BY_TYPE,_not_by_convention::the_built_sticky_carries_a_page_anchor
  Scenario: A built sticky is anchored to the landing page
    Given the built cat-harness sticky
    When its anchor is read
    Then it is a page anchor on the landing page

  @test:schemas/landing-sticky.test.ts::it_is_page-global_BY_TYPE,_not_by_convention::a_BLOCK_anchor_is_refused
  Scenario: A landing sticky with a block anchor is refused
    Given the cat-harness sticky with a block anchor
    When it is parsed as a landing sticky
    Then it throws

  @test:schemas/landing-sticky.test.ts::it_is_page-global_BY_TYPE,_not_by_convention::the_`none`_anchor_is_refused_too
  Scenario: A landing sticky with no anchor kind is refused
    Given the cat-harness sticky with anchor kind none
    When it is parsed
    Then it throws

  @test:schemas/landing-sticky.test.ts::it_is_page-global_BY_TYPE,_not_by_convention::an_ABSENT_anchor_is_refused,_unlike_on_the_base_note
  Scenario: A landing sticky without an anchor is refused
    Given the cat-harness sticky with its anchor removed
    When it is parsed
    Then it throws

  @test:schemas/landing-sticky.test.ts::building_it_twice_produces_the_same_node_—_the_idempotency_key::two_calls_with_the_same_input_are_identical
  Scenario: Building the board twice gives the same nodes
    Given every live contribution
    When the board is built twice
    Then the results are equal

  @test:schemas/landing-sticky.test.ts::building_it_twice_produces_the_same_node_—_the_idempotency_key::the_id_is_declared,_not_derived_from_the_description
  Scenario: A sticky's id does not follow its description
    Given cat-harness's contribution with a different description
    When the sticky is built
    Then its id is still cat-harness

  @test:schemas/landing-sticky.test.ts::building_it_twice_produces_the_same_node_—_the_idempotency_key::`createdAt`_is_an_argument,_so_the_node_does_not_move_on_its_own
  Scenario: createdAt is taken from the caller
    Given a contribution built with createdAt 2020-01-01
    When the sticky is read
    Then its createdAt is that time

  @test:schemas/landing-sticky.test.ts::an_href_may_not_resolve_by_luck_—_bean_blv9::accepts_%s
  Scenario: Root-relative and https hrefs are accepted
    Given hrefs /guides/index.html, https://example.org/x and HTTPS://EXAMPLE.ORG/x
    When each is parsed as a landing link
    Then each is accepted

  @test:schemas/landing-sticky.test.ts::an_href_may_not_resolve_by_luck_—_bean_blv9::refuses_%s
  Scenario: Relative and empty hrefs are refused
    Given hrefs guides/index.html, installation.html, ./x.html, ../x.html and the empty string
    When each is parsed as a landing link
    Then each is refused

  @test:schemas/landing-sticky.test.ts::an_href_may_not_resolve_by_luck_—_bean_blv9::every_default_link_is_accepted_by_that_rule
  Scenario: Every default onboarding link is accepted
    Given the default onboarding links
    When each is parsed
    Then each is accepted

  @test:schemas/landing-sticky.test.ts::an_href_may_not_resolve_by_luck_—_bean_blv9::every_link_in_every_live_declaration_is_accepted_by_that_rule
  Scenario: Every link in every live declaration is accepted
    Given the links of every live contribution
    When each is parsed
    Then there is at least one and each is accepted

  @test:schemas/landing-sticky.test.ts::an_href_may_not_resolve_by_luck_—_bean_blv9::external_links_are_DERIVED_from_the_scheme,_not_declared
  Scenario: A link is external by its scheme
    Given an https link and a root-relative link
    When each is tested as external
    Then the first is and the second is not

  @test:schemas/landing-sticky.test.ts::an_href_may_not_resolve_by_luck_—_bean_blv9::no_default_link_is_external,_so_all_four_take_`relative_url`
  Scenario: No default onboarding link is external
    Given the default onboarding links
    When the external ones are listed
    Then there are none

  @test:schemas/landing-sticky.test.ts::the_four_default_links_point_at_pages_that_EXIST::%s_resolves_to_a_source_page
  Scenario: Each default onboarding link has a source page
    Given each default onboarding href
    When its stem is looked for as .md, index.md or .html under the harness's site
    Then one exists

  @test:schemas/landing-sticky.test.ts::the_four_default_links_point_at_pages_that_EXIST::the_check_CAN_fire
  Scenario: The page check can fail
    Given a page that does not exist
    When it is looked for under the site
    Then it is not found

  @test:schemas/landing-sticky.test.ts::the_four_default_links_point_at_pages_that_EXIST::there_are_four_of_them,_in_the_order_a_reader_meets_them
  Scenario: There are four default links in reading order
    Given the default onboarding links
    When their hrefs are listed
    Then they are beans-and-todos, getting-started, content-types and the guides index, in that order

  @test:schemas/landing-sticky.test.ts::EVERY_declared_link_resolves_to_a_page_that_exists::there_are_site_links_to_check
  Scenario: There are site links to check
    Given every non-external link of every live contribution
    When they are counted
    Then there are more than three

  @test:schemas/landing-sticky.test.ts::EVERY_declared_link_resolves_to_a_page_that_exists::%s_->_%s_resolves_to_a_source_page
  Scenario: Every declared site link has a source page
    Given each declared site link
    When its stem is looked for in the harness's site or in the named layer's declared docs sources
    Then a source page exists

  @test:schemas/landing-sticky.test.ts::EVERY_declared_link_resolves_to_a_page_that_exists::every_absolute_link_is_https,_not_a_bare_host_or_http
  Scenario: Every absolute link is https
    Given every external link of every live contribution
    When each is read
    Then there is at least one and each starts with https://

  @test:schemas/landing-sticky.test.ts::`onboardingLinks`_asks_for_the_SET_rather_than_copying_it::the_flag_appends_all_four,_AFTER_the_layer's_own_links
  Scenario: The onboarding flag appends the four default links after the card's own
    Given cat-harness's card, which sets onboardingLinks
    When it is built
    Then its links are its own declared links followed by the four defaults

  @test:schemas/landing-sticky.test.ts::`onboardingLinks`_asks_for_the_SET_rather_than_copying_it::no_declaration_copies_the_onboarding_SET,_which_would_be_the_BLOCK_KINDS_shape
  Scenario: No declaration copies the whole onboarding set
    Given every live contribution's links
    When those that are onboarding hrefs are counted
    Then each contribution has fewer than all four

  @test:schemas/landing-sticky.test.ts::`onboardingLinks`_asks_for_the_SET_rather_than_copying_it::without_the_flag_a_sticky_carries_exactly_its_declared_links_and_no_more
  Scenario: Without the flag a sticky has exactly its declared links
    Given core's folio-assist-core card, which does not set onboardingLinks
    When it is built
    Then its links are exactly its declared links

  @test:schemas/landing-sticky.test.ts::it_is_recognised_by_its_declared_tag,_not_by_its_shape::the_built_sticky_is_recognised
  Scenario: A built sticky is recognised as a landing sticky
    Given the built cat-harness sticky
    When it is tested
    Then it is a landing sticky

  @test:schemas/landing-sticky.test.ts::it_is_recognised_by_its_declared_tag,_not_by_its_shape::a_note_that_merely_has_the_id_is_NOT
  Scenario: A note with only the id is not a landing sticky
    Given a note with id "landing" and a summary
    When it is tested
    Then it is not a landing sticky

  @test:schemas/landing-sticky.test.ts::it_is_recognised_by_its_declared_tag,_not_by_its_shape::null_and_undefined_do_not_throw
  Scenario: Null and undefined are not landing stickies
    Given null and undefined
    When each is tested
    Then neither is a landing sticky and nothing throws

  @test:schemas/landing-sticky.test.ts::it_is_recognised_by_its_declared_tag,_not_by_its_shape::the_tag_is_what_the_schema_requires
  Scenario: A built sticky carries the landing sticky tag
    Given the built cat-harness sticky
    When its $schema is read
    Then it is the landing sticky schema tag

  @test:schemas/landing-sticky.test.ts::the_summary_is_derived,_not_a_second_field_to_keep_in_step::it_is_the_body's_first_non-blank_line_when_none_is_declared
  Scenario: Without a declared summary it is the body's first line
    Given a bodyFrom-summary contribution from a layer with summary "First line." and one other spelling
    When the sticky is built
    Then its summary is "First line."
    And its comment is the summary, a blank line and the "Also written" line

  @test:schemas/landing-sticky.test.ts::the_summary_is_derived,_not_a_second_field_to_keep_in_step::a_declared_summary_wins
  Scenario: A declared summary wins
    Given core's folio-assist-core card
    When it is built
    Then its summary is "What a folio is"

  @test:schemas/landing-sticky.test.ts::the_sub-graphs_card_says_what_the_owner_asked_for::it_names_all_four_sub-graphs,_including_`process`
  Scenario: The sub-graphs card names all four sub-graphs
    Given core's card body
    When it is read
    Then it contains Content, Skills, Processes and Tools

  @test:schemas/landing-sticky.test.ts::the_sub-graphs_card_says_what_the_owner_asked_for::each_of_the_four_is_LINKED,_not_merely_named
  Scenario: The sub-graphs card links all four sub-graphs
    Given core's card links
    When their labels are read
    Then they include Content, Skills, Processes and Tools

  @test:schemas/landing-sticky.test.ts::the_sub-graphs_card_says_what_the_owner_asked_for::acquisition_is_described_as_a_STEP,_not_a_fifth_graph_typology
  Scenario: The sub-graphs card calls acquisition a step
    Given core's card body
    When it is read
    Then it mentions acquisition and calls it a step rather than a graph typology

  @test:schemas/landing-sticky.test.ts::the_sub-graphs_card_says_what_the_owner_asked_for::it_says_where_acquisition's_two_ends_are,_since_they_are_real_directories
  Scenario: The sub-graphs card names uploads and library
    Given core's card body
    When it is read
    Then it mentions uploads/ and library/

  @test:schemas/landing-sticky.test.ts::the_cat's_introduction_keeps_the_owner's_own_words::verbatim,_down_to_the_shape_of_the_sentence
  Scenario: The cat's introduction is the owner's sentence verbatim
    Given the built cat-harness card
    When its comment is read
    Then it contains the owner's introduction sentence exactly

  @test:schemas/landing-sticky.test.ts::the_cat's_introduction_keeps_the_owner's_own_words::every_card_of_this_harness_takes_ONE_theme_—_the_convention
  Scenario: Every cat-harness card uses one theme
    Given cat-harness's contributions
    When their theme ids are collected
    Then they are exactly grumpy-cyborg-agents

  @test:schemas/landing-sticky.test.ts::the_cat's_introduction_keeps_the_owner's_own_words::bootstrap_does_NOT_share_it,_which_is_what_makes_the_theme_the_harness's_own
  Scenario: bootstrap does not use the harness's theme
    Given bootstrap's contributions' themes
    When each is compared with "grumpy-cyborg-agents"
    Then none is equal
    # Gap: the theme objects themselves, not their themeId, are compared with the string, so the comparison can never be equal; the test passes even if bootstrap used that theme.

  @test:schemas/landing-sticky.test.ts::the_cat's_introduction_keeps_the_owner's_own_words::its_source_link_is_absolute_and_does_not_point_at_this_site
  Scenario: The cat's source link is absolute and not this site
    Given the built cat-harness card's links
    When its external link is found
    Then it exists and is not cat-harness's canonical URL

  @test:schemas/landing-sticky.test.ts::the_cat's_introduction_keeps_the_owner's_own_words::it_also_carries_an_RTFM_link_to_this_harness's_own_docs
  Scenario: The cat's card carries an RTFM link
    Given the built cat-harness card's links
    When their labels are read
    Then one mentions RTFM

  @test:schemas/landing-sticky.test.ts::bootstrap's_card_links_to_its_source_and_does_NOT_invent_a_site::it_offers_a_source_link
  Scenario: bootstrap's card links to its source
    Given the built bootstrap card's links
    When they are read
    Then there is at least one, and an external link mentioning /bootstrap

  @test:schemas/landing-sticky.test.ts::bootstrap's_card_links_to_its_source_and_does_NOT_invent_a_site::it_offers_no_link_to_a_bootstrap_site,_because_there_is_none
  Scenario: bootstrap's card does not link into the harness's site
    Given the built bootstrap card's links and cat-harness's canonical URL
    When each href is compared
    Then none starts with that URL

  @test:schemas/landing-sticky.test.ts::sourceLinks_—_where_a_card's_declaration_can_be_read_and_edited::both_forms,_because_reading_and_editing_are_different_acts
  Scenario: Source links give a view and an edit URL
    Given the folio-assistant repository, index.config.json and branch main
    When its source links are made
    Then they are the blob and edit URLs of that file

  @test:schemas/landing-sticky.test.ts::sourceLinks_—_where_a_card's_declaration_can_be_read_and_edited::a_file_in_a_remote_mount_is_read_and_edited_in_the_mount's_own_repository
  Scenario: A file in a remote mount links to the mount's repository
    Given the aggregate checkout, the test being skipped otherwise
    When source links are made for cat-harness/cat-harness.json
    Then they are the blob and edit URLs in litlfred/cat-harness

  @test:schemas/landing-sticky.test.ts::sourceLinks_—_where_a_card's_declaration_can_be_read_and_edited::a_file_in_a_submodule_is_read_and_edited_in_the_submodule's_own_repository
  Scenario: A file in a submodule links to the submodule's repository
    Given bootstrap/bootstrap.json
    When its source links are made
    Then they are the blob and edit URLs in litlfred/bootstrap

  @test:schemas/landing-sticky.test.ts::sourceLinks_—_where_a_card's_declaration_can_be_read_and_edited::with_NO_forge,_it_is_ABSENT_rather_than_broken
  Scenario: With no forge there are no source links
    Given no repository URL
    When source links are made
    Then there are none

  @test:schemas/landing-sticky.test.ts::sourceLinks_—_where_a_card's_declaration_can_be_read_and_edited::the_path_is_the_CONTRIBUTING_instance's,_not_a_default
  Scenario: Each contributing layer's edit link is its own
    Given the aggregate checkout, the test being skipped otherwise
    When edit links are made for cat-harness's and core's declarations
    Then they differ and each is in its own repository

  @test:schemas/landing-sticky.test.ts::sourceLinks_—_where_a_card's_declaration_can_be_read_and_edited::a_branch_other_than_main_is_honoured
  Scenario: A branch other than main is used
    Given branch claude/x
    When an edit link is made
    Then it uses that branch

  @test:schemas/landing-sticky.test.ts::sourceLinks_—_where_a_card's_declaration_can_be_read_and_edited::a_path_segment_with_a_space_survives_as_an_escape,_not_as_a_break
  Scenario: A space in a path is escaped
    Given the path "some dir/some dir.json"
    When its view link is made
    Then each space is written %20
