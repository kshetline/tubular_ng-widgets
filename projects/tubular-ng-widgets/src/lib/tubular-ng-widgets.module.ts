import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';

import { FormErrorDisplayComponent } from './form-error-display/form-error-display.component';
import { TimeEditorComponent } from './time-editor/time-editor.component';
import { AngleEditorComponent } from './angle-editor/angle-editor.component';

@NgModule({
  declarations: [
    AngleEditorComponent,
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
    FormErrorDisplayComponent,
    TimeEditorComponent
  ]
})
export class TubularNgWidgetsModule { }
