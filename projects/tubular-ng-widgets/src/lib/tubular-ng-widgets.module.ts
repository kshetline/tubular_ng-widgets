import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';

import { DigitSequenceEditorDirective } from './digit-sequence-editor/digit-sequence-editor.directive';
import { TimeEditorComponent } from './time-editor/time-editor.component';

@NgModule({
  declarations: [
    DigitSequenceEditorDirective,
    TimeEditorComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CommonModule
  ],
  exports: [
    DigitSequenceEditorDirective,
    TimeEditorComponent
  ]
})
export class TubularNgWidgetsModule { }
