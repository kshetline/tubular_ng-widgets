import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';

import { DigitSequenceEditorComponent } from './digit-sequence-editor/digit-sequence-editor.component';
import { TimeEditorComponent } from './time-editor/time-editor.component';

@NgModule({
  declarations: [
    DigitSequenceEditorComponent,
    TimeEditorComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CommonModule
  ],
  exports: [
    DigitSequenceEditorComponent,
    TimeEditorComponent
  ]
})
export class TubularNgWidgetsModule { }
