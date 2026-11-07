# Specifies methodologyRows, page, pageRelPath and short
# (scripts/gen-methodologies-viz.ts) over the checkout's real methodology
# corpus, with checkMethodologyEvidence's report.
Feature: The methodologies page over the real corpus has working links, sound tables and true counts

  @T1
  Scenario: The methodology graph is found and has rows
    Given the methodology evidence report of the cat-harness instance
    When the page rows are built
    Then the report is not undetermined
    And there is at least one row

  @T2
  Scenario: Every row's link resolves to an anchor on the page
    Given the page as rendered now and the page as committed under the declared path
    When the links and the anchors (explicit "<a id>" or kramdown heading ids) of each are collected
    Then each page has one link per row
    And every link targets an anchor on the same page

  @T3
  Scenario: Every table row has its header's number of columns
    Given the rendered page
    When the rows after the "| methodology |" header are split on unescaped pipes
    Then the header is found
    And each row has as many columns as the header

  @T4
  Scenario: No table row leaves a code span open
    Given the page as rendered now and as committed
    When the table rows after the "| methodology |" header are read
    Then the header is found and there is one table row per methodology row
    And every table row has an even number of backticks

  @T5
  Scenario: A cut inside a code span or bold run backs out of it
    Given a 130-character run followed by a code span, and another followed by a bold phrase
    When each is shortened to 140 characters
    Then the shortened code text has an even number of backticks and ends with "…"
    And the shortened bold text has an even number of "**"
    And 200 "z"s shortened to 150 are the first 150 followed by "…"

  @T6
  Scenario: The page path is declared and under the docs tree
    Given the checkout
    When the page's relative path is read
    Then it is defined
    And it does not start with ".."

  @T7
  Scenario: The counts on the page are the counts in the rows
    Given the rendered page
    When its "adopted methodologies", "with the source held here" and "cited, not ingested" figures are read
    Then they equal the number of rows, of "ingested" rows and of "cited-only" rows
