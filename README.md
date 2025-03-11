# @tubular/ng-widgets

This project is a small (and possibly growing?) collection of UI widgets for the Angular environment.

Two of the widgets are date/time input fields, `<tbw-time-editor>` (`TimeEditorComponent`) and `<tbw-calendar>` (`CalendarPanelComponent`), both related to and requiring the `@tubular/time` library, and thus capable of the leveraging the elaborate support `@tubular/time` provides for handling Daylight Saving Time changes, leap seconds, and historical time zone changes.

Another widget is `<tbw-angle-editor>` (`AngleEditorComponent`), used for the input of angular values in either decimal or sexagesimal format, and particularly useful for the input of latitude and longitude. Together with the two time widgets this provides an input scheme particularly useful to astronomical applications.

The forth widget currently available, `<tbw-shrink-wrap>` (`ShrinkWrapComponent`), is here, I will admit, simply because it's the only other Angular widget I've created worthy of broad use beyond the application for which it was originally created, and this was a convenient home for it.

`<tbw-shrink-wrap>` is a wrapper for other components that makes those components smoothly resizeable in a way that the CSS `scale` transform alone does not provide, as the CSS transform only changes the scale of rendering within a component without a corresponding change in the display real estate that the component demands.

If you tell `<tbw-shrink-wrap>` to scale by 90%, the content will be rendered 10% smaller and the entire wrapped set of components will also demand 10% less width and height.
