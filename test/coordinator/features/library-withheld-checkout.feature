# Specifies the library viewer data (readLibraryGraph, projection,
# entryBlocks, avatarCopies) over a scratch checkout holding one real who-iris
# entry, with and without a withheld.json naming it. The per-slug tests have
# computed titles and are not tagged here.
Feature: The viewer data honours a withheld list over a declared fixture

  @test:test/coordinator/library-withheld-checkout.test.ts::the_viewer_data_honours_who-iris's_withheld_list_—_over_a_declared_fixture::the_list_names_at_least_one_entry_—_else_this_half_proves_nothing
  Scenario: The fixture's withheld list names an entry the generator read
    Given a scratch checkout with the who-iris entry who-pub-tps-931 and a withheld.json naming it
    When the withheld paths and the projected entries are read
    Then at least one entry is withheld
    And the projected entries include who-pub-tps-931

  @test:test/coordinator/library-withheld-checkout.test.ts::the_viewer_data_honours_who-iris's_withheld_list_—_over_a_declared_fixture::the_fixture_is_what_is_tested:_the_same_entry,_NOT_withheld,_publishes_all_three
  Scenario: Without the withheld list the same entry publishes its excerpt, avatar and no flag
    Given the same scratch checkout without withheld.json
    When the viewer data is derived
    Then the entry is not flagged withheld
    And it has an avatar
    And it has a prose block with content
    And its avatar is copied
