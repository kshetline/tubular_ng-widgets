import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';

import { CalendarPanelComponent } from './calendar-panel/calendar-panel.component';
import { FormErrorDisplayComponent } from './form-error-display/form-error-display.component';
import { TimeEditorComponent } from './time-editor/time-editor.component';
import { AngleEditorComponent } from './angle-editor/angle-editor.component';

@NgModule({
  declarations: [
    AngleEditorComponent,
    CalendarPanelComponent,
    FormErrorDisplayComponent,
    TimeEditorComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CommonModule
  ],
  exports: [
    AngleEditorComponent,
    CalendarPanelComponent,
    FormErrorDisplayComponent,
    TimeEditorComponent
  ]
})
export class TubularNgWidgetsModule { }
