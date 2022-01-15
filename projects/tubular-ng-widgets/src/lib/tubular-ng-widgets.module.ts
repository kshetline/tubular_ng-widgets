import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AngleEditorComponent } from './angle-editor/angle-editor.component';
import { CalendarPanelComponent } from './calendar-panel/calendar-panel.component';
import { FormErrorDisplayComponent } from './form-error-display/form-error-display.component';
import { ShrinkWrapComponent } from './shrink-wrap/shrink-wrap.component';
import { TimeEditorComponent } from './time-editor/time-editor.component';

@NgModule({
  declarations: [
    AngleEditorComponent,
    CalendarPanelComponent,
    FormErrorDisplayComponent,
    ShrinkWrapComponent,
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
    ShrinkWrapComponent,
    TimeEditorComponent
  ]
})
export class TubularNgWidgetsModule { }
