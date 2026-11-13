# Specifies the `avatarRegion` field of a KG image (schemas/kg/kg-node.ts):
# a box declared per card image, square in pixels, in bounds, and checkable.
Feature: An image's avatar region is square in pixels and declared only on card crops

  @test:schemas/avatar-region.test.ts::this_repository's_seven_measured_boxes::every_card_crop_carries_one_—_the_set_is_complete,_not_partial
  Scenario: Every card crop in this repository declares an avatar region
    Given the images of this repository's declaration whose layout is "card"
    When the cards without an avatarRegion are listed
    Then there is at least one card
    And no card lacks an avatarRegion

  @test:schemas/avatar-region.test.ts::this_repository's_seven_measured_boxes::only_CARD_crops_carry_one
  Scenario: Only card crops declare an avatar region
    Given the images of this repository's declaration that declare an avatarRegion
    When those whose layout is not "card" are listed
    Then the list is empty

  @test:schemas/avatar-region.test.ts::this_repository's_seven_measured_boxes::each_one_validates,_which_is_squareness_and_bounds_together
  Scenario: Every declared avatar region validates against the image schema
    Given each image of this repository that declares an avatarRegion
    When it is parsed with the KG image schema
    Then it parses with no issues

  @test:schemas/avatar-region.test.ts::this_repository's_seven_measured_boxes::each_names_a_file_that_exists
  Scenario: Every image with an avatar region names a file that exists
    Given each image of this repository that declares an avatarRegion
    When its src is resolved against the harness root
    Then the file exists

  @test:schemas/avatar-region.test.ts::this_repository's_seven_measured_boxes::no_box_is_the_whole_frame
  Scenario: No declared avatar region is the whole frame
    Given each image of this repository that declares an avatarRegion
    When its box width and height are read
    Then no box has both a width and a height of 1 or more

  @test:schemas/avatar-region.test.ts::a_box_that_is_not_square_is_refused::wider_than_tall
  Scenario: A box wider than it is tall is refused
    Given a square 1254px card whose avatarRegion is 0.5 wide and 0.25 tall
    When it is parsed with the KG image schema
    Then it is refused
    And the first issue says the box is "not square"

  @test:schemas/avatar-region.test.ts::a_box_that_is_not_square_is_refused::taller_than_wide
  Scenario: A box taller than it is wide is refused
    Given a square 1254px card whose avatarRegion is 0.25 wide and 0.5 tall
    When it is parsed
    Then it is refused

  @test:schemas/avatar-region.test.ts::a_box_that_is_not_square_is_refused::square_IS_accepted_—_the_assertions_above_pass_for_a_schema_that_refuses_everything
  Scenario: A square box on a square card is accepted
    Given a square 1254px card whose avatarRegion is 0.5 by 0.5 at y 0.46
    When it is parsed
    Then it parses

  @test:schemas/avatar-region.test.ts::a_box_that_is_not_square_is_refused::equal_fractions_on_a_NON-square_image_are_refused
  Scenario: Equal fractions on a non-square image are refused
    Given a 1671 by 941 image whose avatarRegion is 0.4 wide and 0.4 tall
    When it is parsed
    Then it is refused, because the box is not square in pixels

  @test:schemas/avatar-region.test.ts::a_box_that_is_not_square_is_refused::and_the_matching_PIXEL-square_box_on_that_image_is_accepted
  Scenario: A pixel-square box on a non-square image is accepted
    Given a 1671 by 941 image whose avatarRegion is 0.4 wide and 0.7103 tall
    When it is parsed
    Then it parses

  @test:schemas/avatar-region.test.ts::a_box_that_is_not_square_is_refused::the_tolerance_is_a_pixel,_and_it_is_not_a_licence
  Scenario: Squareness tolerates sub-pixel rounding and nothing more
    Given a square 1254px card
    When its avatarRegion is 0.5 wide and taller by half the squareness tolerance in pixels
    Then it parses
    And when its avatarRegion is 0.5 wide and 0.52 tall it is refused

  @test:schemas/avatar-region.test.ts::an_unverifiable_box_is_refused,_not_accepted_unchecked::no_width
  Scenario: An avatar region on an image with no width is refused
    Given an image with a height but no width and a 0.5 by 0.5 avatarRegion
    When it is parsed
    Then it is refused
    And the first issue names "`width` and `height`"

  @test:schemas/avatar-region.test.ts::an_unverifiable_box_is_refused,_not_accepted_unchecked::no_dimensions_at_all
  Scenario: An avatar region on an image with no dimensions is refused
    Given an image with neither width nor height and a 0.5 by 0.5 avatarRegion
    When it is parsed
    Then it is refused

  @test:schemas/avatar-region.test.ts::an_unverifiable_box_is_refused,_not_accepted_unchecked::but_an_image_with_NO_avatarRegion_needs_no_dimensions
  Scenario: An image with no avatar region needs no dimensions
    Given an image with only an id and an SVG src
    When it is parsed
    Then it parses

  @test:schemas/avatar-region.test.ts::it_does_not_disturb_textRegion::a_wide_shallow_textRegion_is_still_fine_—_squareness_is_avatar-only
  Scenario: A wide, shallow text region is not held to squareness
    Given a square card with a textRegion 0.58 wide and 0.235 tall
    When it is parsed
    Then it parses

  @test:schemas/avatar-region.test.ts::it_does_not_disturb_textRegion::both_regions_on_one_image,_each_judged_by_its_own_rule
  Scenario: A text region and an avatar region coexist on one image
    Given a square card with a wide textRegion and a square avatarRegion
    When it is parsed
    Then it parses

  @test:schemas/avatar-region.test.ts::it_does_not_disturb_textRegion::out_of_bounds_is_still_refused,_and_the_message_names_neither_field
  Scenario: An out-of-bounds avatar region is refused with a field-neutral message
    Given a square card whose avatarRegion starts at x 0.8 and is 0.5 wide
    When it is parsed
    Then it is refused
    And the first issue is exactly "region extends past the edge of the image"
