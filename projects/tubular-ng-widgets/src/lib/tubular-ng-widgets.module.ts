import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';

import { TimeEditorComponent } from './time-editor/time-editor.component';

@NgModule({
  declarations: [
    TimeEditorComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CommonModule
  ],
  exports: [
    TimeEditorComponent
  ]
})
export class TubularNgWidgetsModule { }
