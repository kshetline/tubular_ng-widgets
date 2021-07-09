import { Component, forwardRef, Injector, Input, OnInit } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, NG_VALUE_ACCESSOR } from '@angular/forms';
import { clone, isArray, isEqual, repeat, toNumber } from '@tubular/util';
import {
  BACKGROUND_ANIMATIONS, DigitSequenceEditorDirective, SequenceItemInfo
} from '../digit-sequence-editor/digit-sequence-editor.directive';

export enum AngleStyle { DD, DD_MM, DD_MM_SS, DDD, DDD_MM, DDD_MM_SS }

export interface AngleEditorOptions {
  angleStyle?: AngleStyle;
  compass?: boolean | string[];
  decimalPlaces?: number;
  degreeMark?: string;
  locale?: string | string[];
  minuteMark?: string;
  secondMark?: string;
}

let hasIntl = false;
let defaultLocale = 'en';

try {
  hasIntl = typeof Intl !== 'undefined' && !!Intl?.DateTimeFormat;

  if (hasIntl)
    Intl.NumberFormat('en').format(1.2);
  else
    console.warn('Intl.DateTimeFormat not available');
}
catch (e) {
  hasIntl = false;
  console.warn('Intl.DateTimeFormat not available: %s', e.message || e.toString());
}

try {
  if (typeof process === 'object' && process.env?.LANG)
    defaultLocale = process.env.LANG.replace(/\..*$/, '').replace(/_/g, '-');
  else if (typeof navigator === 'object' && navigator.language)
    defaultLocale = navigator.language;
}
catch (e) {
  defaultLocale = 'en';
}

@Component({
  selector: 'tbw-angle-editor',
  animations: [BACKGROUND_ANIMATIONS],
  templateUrl: '../digit-sequence-editor/digit-sequence-editor.directive.html',
  styleUrls: ['../digit-sequence-editor/digit-sequence-editor.directive.scss'],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AngleEditorComponent), multi: true },
              { provide: NG_VALIDATORS, useExisting: forwardRef(() => AngleEditorComponent), multi: true }]
})
export class AngleEditorComponent extends DigitSequenceEditorDirective<number> implements OnInit {
  private compassPoints: string[];
  private _max: number;
  private _min: number;
  private _options: AngleEditorOptions = {};
  private outOfRange = false;

  private compassIndex = -1;
  private degreeIndex = -1;
  private minuteIndex = -1;
  private secondIndex = -1;
  private signIndex = -1;

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(injector: Injector) { // But this isn't useless! It changes access from protected to public.
    super(injector);
  }

  protected validateImpl(_value: number, _control?: AbstractControl): { [key: string]: any } {
    if (this.outOfRange) {
    }

    return null;
  }

  protected applyPastedText(text: string): void {
  }

  protected getClipboardText(): string {
    return this.getValueAsText();
  }

  get options():  AngleEditorOptions { return this._options; }
  @Input() set options(newValue: AngleEditorOptions) {
    if (!isEqual(this._options, newValue)) {
      this._options = clone(newValue);
      this.createDigits();
      this.createDisplayOrder();
    }
  }

  writeValue(newValue: number): void {
    this.setValue(newValue);
  }

  private setValue(newValue: number, doCallback = false): void {
    if (newValue == null)
      return;

    // this.updateDigits();

    // if (doCallback)
    //   this.reportValueChange();
  }

  setDisabledState?(isDisabled: boolean): void {
    super.setDisabledState(isDisabled);
    this.displayState = (isDisabled ? 'disabled' : (this.viewOnly ? 'viewOnly' : 'normal'));
  }

  get min(): number | string { return this._min; }
  @Input() set min(value: number | string) {
    if (this._min !== value) {
      const before = this.validateImpl(this.value);

      this._min = toNumber(value);

      setTimeout(() => {
        this.updateDigits();
        const after = this.validateImpl(this.value);

        if (!isEqual(before, after))
          this.valueHasChanged(true);
      });
    }
  }

  get max(): Date | number | string { return this._max; }
  @Input() set max(value: Date | number | string) {
    if (this._max !== value) {
      const before = this.validateImpl(this.value);

      this._max = toNumber(value);

      this.outOfRange = false;
      setTimeout(() => {
        this.updateDigits();
        const after = this.validateImpl(this.value);

        if (!isEqual(before, after))
          this.valueHasChanged(true);
      });
    }
  }

  protected createDigits(): void {
    this.items.length = 0;
    this.compassIndex = -1;
    this.degreeIndex = -1;
    this.minuteIndex = -1;
    this.secondIndex = -1;
    this.signIndex = -1;

    const steps: string[] = [];
    const opts = this._options;
    const locale = opts.locale || defaultLocale;
    const style = opts.angleStyle ?? AngleStyle.DDD_MM_SS;

    if (isArray(opts.compass))
      this.compassPoints = opts.compass;
    else if (style < AngleStyle.DDD)
      this.compassPoints = ['W', 'E'];
    else
      this.compassPoints = ['S', 'N'];

    const addDigits = (n: number, format?: string): void =>
      repeat(n, () => this.items.push({ value: 0, digit: true, editable: true, format }));

    if (!!opts.compass)
      steps.push('sign');

    if (style < AngleStyle.DDD)
      steps.push('deg2', 'dmark');
    else
      steps.push('deg3', 'dmark');

    if ([AngleStyle.DD_MM, AngleStyle.DD_MM_SS, AngleStyle.DDD_MM, AngleStyle.DDD_MM_SS].includes(style))
      steps.push('min', 'mmark');

    if ([AngleStyle.DD_MM_SS, AngleStyle.DDD_MM_SS].includes(style))
      steps.push('sec', 'smark');

    if (opts.decimalPlaces > 0)
      steps.splice(-1, 0, 'dec');

    for (const step of steps) {
      const i = this.items.length;

      switch (step) {
      }
    }

    this.updateDigits();
  }

  getClassForItem(item: SequenceItemInfo): string {
    super.getClassForItem(item);
  }

  private updateDigits(angle?: number, delta = 0, selection = -1): void {
    const programmatic = (dateTime === undefined);

    angle = (angle === undefined ? this.value : angle);

    const i = this.items as any[];
    const value = delta === 0 ? 'value' : delta < 0 ? 'swipeBelow' : 'swipeAbove';
    const alt_value = 'alt_' + value;
    let j: number;
  }

  private getAngleFromDigits(): number {
  }

  createSwipeValues(index: number): void {
    this.roll(1, index, false);
    this.roll(-1, index, false);

    for (let i = 0; i < this.items.length; ++i) {
      const item = this.items[i];

      if (i === index || item.divider || item.static)
        continue;
      if (item.value === item.swipeAbove && item.value === item.swipeBelow)
        item.swipeAbove = item.swipeBelow = null;
      else if (item.editable)
        break;
    }
  }

  protected increment(): void {
    this.roll(1);
  }

  protected decrement(): void {
    this.roll(-1);
  }

  private roll(sign: number, sel = this.selection, updateTime = true): void {
  }

  protected onKey(key: string): void {
    const keyLc = key.toLocaleLowerCase(this._options.locale);
    const editable = !this.disabled && !this.viewOnly;

    super.onKey(key);
  }

  protected digitTyped(charCode: number, key: string): void {
    const i = this.items;
    const sel = this.selection;
    const origValue = i[sel].value;
    let newValue: number | string = origValue;

    this.cursorForward();
  }

  getValueAsText(): string {
  }

  private parseText(s: string): number {
    s = s.trim();

    return null;
  }
}
