# Specifies site.build of a harness config (HarnessSiteSchema in
# schemas/kg/harness-config.ts): the recipe a site build runs.
Feature: A site's build recipe is three lists of package script names and an optional home page

  @test:schemas/site-build-recipe.test.ts::site.build::holds_the_three_step_lists_and_an_optional_home_page
  Scenario: A full build recipe is kept as given
    Given a site build with home "README.md" and one pre, source and site step each
    When the site is parsed
    Then the build is kept as given

  @test:schemas/site-build-recipe.test.ts::site.build::an_omitted_list_is_empty,_not_absent
  Scenario: Omitted step lists become empty lists
    Given a site build declaring only sourceSteps
    When it is parsed
    Then pre and siteSteps are empty lists

  @test:schemas/site-build-recipe.test.ts::site.build::a_step_is_a_package_script_NAME:_a_command_is_refused
  Scenario: A shell command is refused as a step
    Given a pre step "rm -rf /" and a site step "a; b"
    When each site is parsed
    Then each is refused

  @test:schemas/site-build-recipe.test.ts::site.build::a_site_with_no_build_is_unchanged
  Scenario: A site with no build gains none
    Given a site with only landing true
    When it is parsed
    Then it is unchanged
