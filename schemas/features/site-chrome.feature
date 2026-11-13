# Specifies the site layers of a declaration (siteLayersFor, siteChromeDirFor,
# siteFileFor in schemas/kg/cat-harness.ts) and cat-harness's own site chrome:
# its includes, config, theme overrides, asset versions and page-relative links.
Feature: A site is built from declared layers, with cat-harness's chrome as the base

  @test:schemas/site-chrome.test.ts::site_layers::one_docs_directory:_every_answer_is_siteDirFor's
  Scenario: With one docs directory every site answer is that directory
    Given an instance declaring one docs directory
    When its site layers, chrome directory and a file's location are asked
    Then each answer is its site directory

  @test:schemas/site-chrome.test.ts::site_layers::a_chrome_layer_declared_first_is_the_base;_a_file_resolves_to_the_top-most_layer_holding_it
  Scenario: The first-declared docs layer is the base and a file resolves to the top-most layer holding it
    Given an instance declaring docs layers chrome, pages and a repository-scoped root-pages
    When its site layers are listed and files are located
    Then the layers are chrome, pages and the site directory, with chrome the chrome directory
    And an include held only in chrome resolves there, a config in both resolves to pages, and a new file defaults to chrome

  @test:schemas/site-chrome.test.ts::cat-harness's_own_site_chrome::is_declared_before_docs,_so_it_is_the_base_layer
  Scenario: cat-harness's site-chrome is its base layer
    Given the cat-harness declaration
    When its site layers are listed
    Then they are site-chrome and its site directory, and site-chrome is the chrome directory

  @test:schemas/site-chrome.test.ts::cat-harness's_own_site_chrome::holds_the_chrome_the_slice_moved,_and_docs/_no_longer_does
  Scenario: The chrome files live in site-chrome, not docs
    Given the head, footer and nav includes, the mermaid config, the docs-ui and navbar assets and the Gemfile
    When each is located in cat-harness's site
    Then it resolves to site-chrome and is absent from the docs directory
    And the work-plan, process-index, slice-sqlite and kg-render scripts resolve to the docs directory

  @test:schemas/site-chrome.test.ts::cat-harness's_own_site_chrome::an_include_the_chrome_pulls_in_exists_in_the_chrome_alone,_so_a_site_with_no_harness_pages_builds
  Scenario: The generated includes the chrome uses exist in the chrome
    Given the generated navbar-footer and todo-listing includes
    When they are looked for in site-chrome
    Then both exist

  @test:schemas/site-chrome.test.ts::cat-harness's_own_site_chrome::the_nav_is_cached:_each_theme_override_looks_its_answer_up_in_a_map_rendered_once_per_build
  Scenario: Each nav override includes a cached map that does not read the page
    Given the activation, breadcrumbs and children-nav overrides
    When each is read
    Then each includes its nav_cache map with include_cached
    And each map exists and, outside comments, never mentions page.

  @test:schemas/site-chrome.test.ts::cat-harness's_own_site_chrome::the_two__config.yml_layers_merge_to_a_config_with_the_theme_keys_and_the_site's_identity_(D1)
  Scenario: The chrome config carries the theme and the docs config the identity
    Given the _config.yml of site-chrome and of docs
    When both are parsed
    Then the chrome names a just-the-docs remote theme and no title
    And docs names no remote theme but a title
    And every exclude of the chrome is also excluded by docs

  @test:schemas/site-chrome.test.ts::the_theme's_markup_passes_leave_<script>_and_<style>_alone::the_theme's_pass_alone_breaks_the_script_(the_defect,_reproduced)
  Scenario: The theme's own anchor pass breaks an inline script
    Given a page with headings, an inline script holding heading markup, and a style
    When it is rendered through the vendored theme anchor pass alone
    Then some inline script no longer parses
    And the first script has gained "anchor-heading"

  @test:schemas/site-chrome.test.ts::the_theme's_markup_passes_leave_<script>_and_<style>_alone::anchor_headings:_script_and_style_bodies_come_through_byte_for_byte;_every_heading_outside_them_is_anchored
  Scenario: The anchor override leaves scripts and styles intact and anchors every heading
    Given the same page
    When it is rendered through the chrome's anchor_headings override
    Then the script and style come through unchanged and every script parses
    And headings one, two and three are anchored
    And the text after the script is intact

  @test:schemas/site-chrome.test.ts::the_theme's_markup_passes_leave_<script>_and_<style>_alone::anchor_headings:_content_with_no_script_or_style_is_exactly_the_theme's_pass
  Scenario: Without scripts or styles the override equals the theme's pass
    Given content with headings, code and a rule but no script or style
    When it is rendered through the override and through the theme's pass
    Then the outputs are identical

  @test:schemas/site-chrome.test.ts::the_theme's_markup_passes_leave_<script>_and_<style>_alone::table_wrappers:_tables_outside_raw_text_are_wrapped,_the_script's_are_not
  Scenario: The table wrapper wraps real tables and not a script's
    Given a whole page with a style, one real table, and a script whose string holds a table
    When it is rendered through the table_wrappers layout
    Then the script and style are unchanged
    And only the real table is wrapped, once
    And every script parses

  @test:schemas/site-chrome.test.ts::the_theme's_markup_passes_leave_<script>_and_<style>_alone::the_theme's_include_is_kept,_renamed,_for_the_override_to_call
  Scenario: The theme's include is kept under a new name and called by the override
    Given the vendored anchor_headings_core.html and the anchor_headings.html override
    When they are read
    Then the core cites the jekyll-anchor-headings source
    And the override includes the core

  @test:schemas/site-chrome.test.ts::first-party_asset_versions::no_template_prints_site.time,_so_a_rebuild_with_no_source_change_renders_the_same_bytes
  Scenario: No template prints site.time
    Given every html, md, liquid, scss, js and json file under site-chrome and docs
    When they are searched for site.time inside Liquid tags
    Then none is found

  @test:schemas/site-chrome.test.ts::first-party_asset_versions::every_?v=_in_head_custom.html_hashes_the_very_asset_its_URL_names
  Scenario: Every asset version in the head hashes the asset it names
    Given head_custom.html
    When its asset tags with a ?v= version are read
    Then there are at least ten
    And each hashes the same asset its URL names, with fa_asset_version
    And no other ?v= appears except the documented placeholder

  @test:schemas/site-chrome.test.ts::first-party_asset_versions::harness-data.js,_which_carries_live_counts,_is_loaded_with_no_?v
  Scenario: harness-data.js is loaded without a version
    Given head_custom.html
    When the harness-data.js script tag is read
    Then nothing follows its URL

  @test:schemas/site-chrome.test.ts::first-party_asset_versions::the_filter_is_defined_in_the_chrome,_so_every_site_that_mounts_the_chrome_has_it
  Scenario: The asset version filter is defined in the chrome without the clock
    Given the chrome's fa-asset-version.rb plugin
    When it is read
    Then it defines fa_asset_version, registers the filter and a post_render hook
    And its code never reads site.time or Time.now

  @test:schemas/site-chrome.test.ts::the_chrome's_includes_carry_no_HTML_comments_into_pages::every_HTML_comment_outside_<script>/<style>_is_a_fa-_marker
  Scenario: The chrome's includes carry only fa- marker comments
    Given every non-vendored HTML include of the chrome
    When their HTML comments are collected
    Then every one is a conditional comment or a fa- marker

  @test:schemas/site-chrome.test.ts::page-relative_links::the_plugin_swaps_the_base_for_a_token_once_the_site_is_read,_before_generators_run,_and_resolves_it_after_rendering
  Scenario: The root-relative plugin hooks after read and after render and restores the base
    Given the chrome's fa-root-relative.rb plugin
    When its source is matched
    Then it registers swap_in on post_read and resolve on post_render, and restores baseurl in an ensure
    # Gap: only the plugin's Ruby source is pattern-matched; nothing runs the plugin.

  @test:schemas/site-chrome.test.ts::page-relative_links::an_absolute_URL_keeps_the_real_base:_an_identity_is_never_relativized
  Scenario: The plugin keeps the real base for an absolute URL
    Given the root-relative plugin's source
    When it is matched
    Then it builds an absolute URL from origin and base
    # Gap: only the plugin's Ruby source is pattern-matched; nothing runs the plugin.

  @test:schemas/site-chrome.test.ts::page-relative_links::404.html_keeps_the_real_base:_GitHub_Pages_serves_it_at_whatever_depth_was_missing
  Scenario: The plugin skips 404.html
    Given the root-relative plugin's source
    When it is matched
    Then it returns false for the item at /404.html
    # Gap: only the plugin's Ruby source is pattern-matched; nothing runs the plugin.

  @test:schemas/site-chrome.test.ts::page-relative_links::fa-staging_says_only_WHETHER_this_is_a_preview,_never_which_one
  Scenario: The fa-staging meta says only whether this is a preview
    Given head_custom.html
    When its fa-staging meta line is read
    Then it is exactly the line printing "preview" when a staging slug is set
