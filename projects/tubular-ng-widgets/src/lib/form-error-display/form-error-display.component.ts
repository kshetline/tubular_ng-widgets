/* eslint-disable quote-props */
import { Component, Input } from '@angular/core';
import { AbstractControl, AbstractControlDirective } from '@angular/forms';

let This: typeof FormErrorDisplayComponent;

// @dynamic
@Component({
  selector: 'tbw-form-error-display',
  templateUrl: './form-error-display.component.html',
  styleUrls: ['./form-error-display.component.scss']
})
export class FormErrorDisplayComponent {
  private static readonly errorMessages = {
    'required': (): string => 'This field is required',
    'invalid': (params: any): string => params.message ? params.message : 'This field contains an invalid value',
    'minlength': (params: any): string => `The min. allowed number of characters is ${params.requiredLength}`,
    'maxlength': (params: any): string => `The max. allowed number of characters is ${params.requiredLength}`,
    'pattern': (params: any): string => `The required pattern is: ${params.requiredPattern}`,
    'min': (params: any): string => `The minimum allowed value is ${params.min}`,
    'minNumber': (params: any): string => `The minimum allowed value is ${params.min}`,
    'max': (params: any): string => `The maximum allowed value is ${params.max}`,
    'maxNumber': (params: any): string => `The maximum allowed value is ${params.max}`,
  };

  @Input() control: AbstractControlDirective | AbstractControl;

  shouldShowErrors(): boolean {
    return this.control &&
      this.control.errors &&
      (this.control.dirty || this.control.touched);
  }

  listOfErrors(): string[] {
    if (this.shouldShowErrors())
      return Object.keys(this.control.errors).map(field => This.getMessage(field, this.control.errors[field]));

    return [];
  }

  private static getMessage(type: string, params: any): string {
    if (params.message)
      return params.message;

    const errorFunction = FormErrorDisplayComponent.errorMessages[type];

    if (errorFunction)
      return errorFunction(params);
    else
      return `Unknown validation error "${type}"`;
  }
}

This = FormErrorDisplayComponent;
