import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';

import { FormErrorDisplayComponent } from './form-error-display/form-error-display.component';
import { TimeEditorComponent } from './time-editor/time-editor.component';

@NgModule({
  declarations: [
    FormErrorDisplayComponent,
    TimeEditorComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CommonModule
  ],
  exports: [
    FormErrorDisplayComponent,
    TimeEditorComponent
  ]
})
export class TubularNgWidgetsModule { }
