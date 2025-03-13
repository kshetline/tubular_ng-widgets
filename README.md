# @tubular/ng-widgets

This project is a small (and possibly growing?) collection of UI widgets for the Angular environment.

* `@tubular/ng-widgets` v1.x is suitable for Angular 11 and 12 projects which do not use Ivy.
* `@tubular/ng-widgets` v2.x is suitable for Angular 13 or later projects which use Ivy and @NgModule modular design.
* `@tubular/ng-widgets` v3.x is for Angular 17 or later projects in which standalone components are used.

Two of the widgets are date/time input fields: `<tbw-time-editor>` (`TimeEditorComponent`) and `<tbw-calendar>` (`CalendarPanelComponent`), both related to and requiring the `@tubular/time` library, and thus capable of the leveraging the broad support `@tubular/time` provides for handling Daylight Saving Time transitions, leap seconds, and historical time zone changes.

A demo of the above date/time components can be found at https://tzexplorer.org/#code.

Another widget is `<tbw-angle-editor>` (`AngleEditorComponent`), used for the input of angular values in either decimal or sexagesimal format, and particularly useful for the input of latitude and longitude. Together with the two time widgets this provides an input scheme particularly useful to astronomical applications.

`<tbw-form-error-display>` (FormErrorDisplayComponent) is for displaying validation error messages produced by an associated form input component.

<tbw-shrink-wrap>` (`ShrinkWrapComponent`) is a wrapper for other components that makes those components smoothly resizeable in a way that the CSS `scale` transform alone does not provide, as the CSS transform only changes the scale of rendering within a component without a corresponding change in the display real estate that the component demands.

If you tell `<tbw-shrink-wrap>` to scale by 90% the enclosed content will be rendered 10% smaller, and the entire wrapped set of components will also require 10% less width and height. Used judiciously (that is, without subjecting users to uncomfortably small or large text), `<tbw-shrink-wrap>` can be very helpful with responsive layouts, especially when you need something to be just a little bit smaller to fit a mobile display.

