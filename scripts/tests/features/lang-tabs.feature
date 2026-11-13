# scripts/lib/lang-tabs.ts works out where a built page's language tabs link (declared hreflang
# alternate, else the /<locale>/ sibling) so the publish link check can hold them; scripts/lib/
# locale-fallback-404.ts writes the 404 page's English fallback. Each Scenario names the test that executes it.
Feature: Language tab links and the 404 English fallback

  @test:scripts/tests/lang-tabs.test.ts::language_tabs_—_where_the_chrome's_tabs_link_(owner,_2026-11-13:_who-iris/fr/_404)::a_declared_hreflang_alternate_is_the_tab's_href;_the_/<locale>/_guess_only_without_one
  Scenario: A declared hreflang alternate wins over the locale-path guess
    Given an English page at "/who-iris/index.html" whose meta lists en, fr and es as available
    And the page declares a French alternate "who-iris/fr/index.html"
    When its language tabs are computed
    Then the French tab links "who-iris/fr/index.html" from the alternate
    And the Spanish tab links "/who-iris/es/index.html" by convention
    And there are no other tabs

  @test:scripts/tests/lang-tabs.test.ts::language_tabs_—_where_the_chrome's_tabs_link_(owner,_2026-11-13:_who-iris/fr/_404)::a_page_under_a_locale-prefixed_tree_swaps_its_segment_in_place_(the_who-iris_glossary_pages)
  Scenario: A page in a locale-prefixed tree swaps its locale segment in place
    Given a French page at "/who-iris/fr/folio-assistant-core/glossary/index.html" with en, fr and es available
    When its language tabs are computed
    Then the English tab links "/who-iris/folio-assistant-core/glossary/index.html" by convention
    And the Spanish tab links "/who-iris/es/folio-assistant-core/glossary/index.html" by convention
    And for a French page at "/r/x/fr/a.html" the Spanish tab links "/r/x/es/a.html"

  @test:scripts/tests/lang-tabs.test.ts::language_tabs_—_where_the_chrome's_tabs_link_(owner,_2026-11-13:_who-iris/fr/_404)::an_unavailable_locale_draws_no_link,_and_a_page_with_no_meta_block_draws_no_tabs
  Scenario: No available locales or no meta block means no tabs
    Given an English page whose meta lists no available locales
    When its language tabs are computed
    Then there are no tabs
    And a page with no translation meta block also has no tabs

  @test:scripts/tests/lang-tabs.test.ts::language_tabs_—_where_the_chrome's_tabs_link_(owner,_2026-11-13:_who-iris/fr/_404)::a_translated_page's_English_tab_strips_its_own_locale_segment
  Scenario: A translated page's English tab drops its locale segment
    Given a French page at "/r/fr/a.html" with en and fr available
    When its language tabs are computed
    Then the only tab is English, linking "/r/a.html" by convention

  @test:scripts/tests/lang-tabs.test.ts::language_tabs_—_where_the_chrome's_tabs_link_(owner,_2026-11-13:_who-iris/fr/_404)::the_publish_link_check_refuses_a_tab_that_reaches_no_page:_the_who-iris_home_as_it_was
  Scenario: The publish link check reports language tabs that reach no page
    Given a site with "who-iris/fr/index.html" and a home page whose meta lists en, fr and es with no alternates
    When the publish link check runs with base "/who-iris/"
    Then it misses the French tab "/who-iris/fr/index.html" and the Spanish tab "/who-iris/es/index.html", both by convention
    When the home page declares the French alternate "who-iris/fr/index.html" and the check runs again
    Then the only miss is the Spanish tab "/who-iris/es/index.html"

  @test:scripts/tests/lang-tabs.test.ts::the_404_page's_English_fallback::a_locale_segment_is_replaced_by_en/,_then_removed;_never_the_path_asked_for
  Scenario: Fallback candidates replace the locale segment with en, then remove it
    Given the locales ar, zh, en, fr, ru and es
    When fallback candidates are computed for missing paths
    Then "/who-iris/fr/" gives "/who-iris/en/" then "/who-iris/"
    And "/r/branches/x/es/glossary/a.html" gives the en/ path then the unprefixed path
    And "/who-iris/en/" gives only "/who-iris/"
    And "/who-iris/missing.html" gives no candidates
    And for "/fr/", "/a/fr/b" and "/en/" the candidates never include the path itself

  @test:scripts/tests/lang-tabs.test.ts::the_404_page's_English_fallback::a_site_without_a_404_page_gets_one;_a_site_with_one_keeps_it_and_gains_the_fallback,_once
  Scenario: The 404 fallback is written, or added to an existing 404 page, exactly once
    Given a site with no 404 page
    When the locale fallback 404 is written for base "/r/"
    Then the result is "written" and the page carries the fallback mark and a link to "/r/"
    And the fallback notice appears before the fallback script
    And writing again reports "present"
    Given a site whose own 404 page says "Lost"
    When the locale fallback 404 is written
    Then the result is "added", the "Lost" heading is kept, the fallback mark appears once
    And the page ends with the script before the closing body and html tags
