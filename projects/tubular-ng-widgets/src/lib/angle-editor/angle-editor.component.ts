import { Component, forwardRef, Injector, Input, OnInit } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, NG_VALUE_ACCESSOR } from '@angular/forms';
import { clone, convertDigitsToAscii, isArray, isEqual, repeat, toNumber } from '@tubular/util';
import {
  BACKGROUND_ANIMATIONS, DigitSequenceEditorDirective, SequenceItemInfo
} from '../digit-sequence-editor/digit-sequence-editor.directive';
import { timer } from 'rxjs';
import { abs, floor, round } from '@tubular/math';

export enum AngleStyle { DD, DD_MM, DD_MM_SS, DDD, DDD_MM, DDD_MM_SS }

export interface AngleEditorOptions {
  angleStyle?: AngleStyle;
  compass?: boolean | string[];
  decimal?: string;
  decimalPrecision?: number;
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
  private angleDivisor = 1;
  private compassPoints: string[];
  private decimals = 0;
  private intAngle = 0;
  private leftDigits = 3;
  private _max: number = Number.MAX_SAFE_INTEGER;
  private _min: number = Number.MIN_SAFE_INTEGER;
  private _options: AngleEditorOptions = {};
  private outOfRange = false;

  private compassIndex = -1;
  private decimalIndex = -1;
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
    console.log(text);
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

  get value(): number { return this.intAngle / this.angleDivisor; }
  set value(newValue: number) {
    this.setValue(newValue, true);
  }

  private setValue(newValue: number, doCallback = false): void {
    if (newValue == null)
      return;

    this.setIntAngle(round(newValue * this.angleDivisor), doCallback);
  }

  private setIntAngle(newValue: number, doCallback = false): void {
    if (this.intAngle !== newValue) {
      this.intAngle = newValue;
      this.updateDigits();

      if (doCallback)
        this.reportValueChange();
    }
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
    this.decimalIndex = -1;
    this.degreeIndex = -1;
    this.minuteIndex = -1;
    this.secondIndex = -1;
    this.signIndex = -1;

    this.angleDivisor = 1;

    const steps: string[] = [];
    const opts = this._options;
    const locale = opts.locale || defaultLocale;
    const decimal = opts.decimal ||
      (hasIntl && convertDigitsToAscii(Intl.NumberFormat(locale).format(1.2)).replace(/\d/g, '').charAt(0)) || '.';
    const style = opts.angleStyle ?? AngleStyle.DDD_MM_SS;

    if (isArray(opts.compass))
      this.compassPoints = opts.compass;
    else if (style < AngleStyle.DDD)
      this.compassPoints = ['W', 'E'];
    else
      this.compassPoints = ['S', 'N'];

    const addDigits = (n: number, format?: string): void =>
      repeat(n, () => this.items.push({ value: 0, digit: true, editable: true, format }));

    if (!opts.compass)
      steps.push('sign');

    if (style < AngleStyle.DDD) {
      this.leftDigits = 2;
      steps.push('deg2', 'dmark');
    }
    else {
      this.leftDigits = 3;
      steps.push('deg3', 'dmark');
    }

    if ([AngleStyle.DD_MM, AngleStyle.DD_MM_SS, AngleStyle.DDD_MM, AngleStyle.DDD_MM_SS].includes(style)) {
      this.angleDivisor *= 60;
      steps.push('min', 'mmark');
    }

    if ([AngleStyle.DD_MM_SS, AngleStyle.DDD_MM_SS].includes(style)) {
      this.angleDivisor *= 60;
      steps.push('sec', 'smark');
    }

    if (opts.decimalPrecision > 0) {
      this.decimals = opts.decimalPrecision;
      this.angleDivisor *= 10 ** this.decimals;
      steps.splice(-1, 0, 'dec');
    }
    else
      this.decimals = 0;

    if (!!opts.compass)
      steps.push('comp');

    for (const step of steps) {
      const i = this.items.length;

      switch (step) {
        case 'sign':
          this.signIndex = i;
          this.items.push({ value: '+', editable: true, monospaced: true, sign: true, sizer: '-\n+' });
          break;
        case 'deg2': this.degreeIndex = i; addDigits(2); break;
        case 'deg3': this.degreeIndex = i; addDigits(3); break;
        case 'dmark': this.items.push({ value: opts.degreeMark ?? '°', static: true }); break;
        case 'min': this.minuteIndex = i; addDigits(2); break;
        case 'mmark': this.items.push({ value: opts.minuteMark ?? '’', static: true }); break;
        case 'sec': this.secondIndex = i; addDigits(2); break;
        case 'smark': this.items.push({ value: opts.secondMark ?? '”', static: true }); break;
        case 'dec':
          this.items.push({ value: opts.decimal ?? decimal, static: true });
          this.decimalIndex = i + 1;
          addDigits(opts.decimalPrecision);
          break;
        case 'comp':
          this.compassIndex = i;
          this.items.push({ value: opts.compass[1], editable: true, monospaced: true, sign: true,
                            sizer: this.compassPoints.join('\n') });
          break;
      }
    }

    this.updateDigits();
  }

  getClassForItem(item: SequenceItemInfo): string {
    return super.getClassForItem(item);
  }

  private updateDigits(intAngle?: number, delta = 0): void {
    const programmatic = (intAngle === undefined);

    intAngle = (intAngle === undefined ? this.intAngle : intAngle);

    if (intAngle < this._min || intAngle > this._max) {
      intAngle = (intAngle < this._min ? this._min : this._max);

      if (!programmatic) {
        timer().subscribe(() => {
          this.errorFlash();
          this.setIntAngle(intAngle);
          this.updateDigits();
        });

        return;
      }
    }

    const field = delta === 0 ? 'value' : delta < 0 ? 'swipeBelow' : 'swipeAbove';
    const dp = this.decimals;
    let d;
    let m;
    let s;
    let frac = abs(intAngle);

    if (dp > 0) {
      s = floor(frac / 10 ** dp);
      frac = frac % 10 ** dp;
    }
    else {
      s = frac;
      frac = 0;
    }

    if (this.secondIndex >= 0) {
      m = floor(s / 60);
      s = s % 60;
    }
    else {
      m = s;
      s = 0;
    }

    if (this.minuteIndex >= 0) {
      d = floor(m / 60);
      m = m % 60;
    }
    else {
      d = m;
      m = 0;
    }

    this.setDigits(this.degreeIndex, this.leftDigits, d, field);
    this.setDigits(this.minuteIndex, 2, m, field);
    this.setDigits(this.secondIndex, 2, s, field);
    this.setDigits(this.decimalIndex, dp, frac, field);

    if (this.signIndex >= 0)
      this.items[this.signIndex][field] = (intAngle < 0 ? '-' : '+');
    else if (this.compassIndex >= 0)
      this.items[this.signIndex][field] = this.compassPoints[intAngle < 0 ? 0 : 1];
  }

  private getIntAngleFromDigits(): number {
    let intAngle = this.getDigits(this.decimalIndex, this.decimals) / 10 ** this.decimals;
    const div = this.angleDivisor;
    let sign = 1;

    intAngle += this.getDigits(this.decimalIndex, this.leftDigits) * div;
    intAngle += this.getDigits(this.minuteIndex, 2) * (div / 60);
    intAngle += this.getDigits(this.secondIndex, 2) * (div / 3600);

    if (this.signIndex >= 0 && this.items[this.signIndex].value === '-' ||
        this.compassIndex >= 0 && this.items[this.signIndex].value === this.compassPoints[0])
      sign = -1;

    return sign * intAngle;
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

  private roll(sign: number, sel = this.selection, updateAngle = true): void {
    let change = 0;
    let intAngle = this.intAngle;
    const div = this.angleDivisor;

    if (sel === this.signIndex || sel === this.compassIndex)
      change = -sign * intAngle * 2;
    else if (this.degreeIndex <= sel && sel < this.degreeIndex + this.leftDigits)
      change = 10 ** (this.degreeIndex - sel + this.leftDigits - 1) * div;
    else if (this.minuteIndex <= sel && sel < this.minuteIndex + 2)
      change = 10 ** (this.minuteIndex - sel + 1) * (div / 60);
    else if (this.secondIndex <= sel && sel < this.secondIndex + 2)
      change = 10 ** (this.secondIndex - sel + 1) * (div / 3600);
    else if (this.decimalIndex <= sel && sel < this.decimalIndex + this.decimals)
      change = 10 ** (this.decimalIndex - sel + this.decimals - 1);

    intAngle = intAngle + sign * change;

    if (updateAngle)
      this.setIntAngle(intAngle);

    this.updateDigits(intAngle, sign);
  }

  // protected onKey(key: string): void {
  //   const keyLc = key.toLocaleLowerCase(this._options.locale);
  //   const editable = !this.disabled && !this.viewOnly;
  //
  //   super.onKey(key);
  // }
  //
  // protected digitTyped(charCode: number, key: string): void {
  //   const i = this.items;
  //   const sel = this.selection;
  //   const origValue = i[sel].value;
  //   let newValue: number | string = origValue;
  //
  //   this.cursorForward();
  // }

  getValueAsText(): string {
    return null;
  }

  private parseText(_s: string): number {
    // s = s.trim();

    return null;
  }
}
