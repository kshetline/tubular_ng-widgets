import { Component, forwardRef, Injector, Input, OnInit } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, NG_VALUE_ACCESSOR } from '@angular/forms';
import { clone, convertDigitsToAscii, isArray, isEqual, last, repeat, toNumber } from '@tubular/util';
import {
  BACKGROUND_ANIMATIONS, defaultLocale, DigitSequenceEditorDirective, hasIntl, SequenceItemInfo
} from '../digit-sequence-editor/digit-sequence-editor.directive';
import { timer } from 'rxjs';
import { abs, ceil, floor, mod, mod2, round, trunc } from '@tubular/math';

export enum AngleStyle { DD, DD_MM, DD_MM_SS, DDD, DDD_MM, DDD_MM_SS }

export interface AngleEditorOptions {
  angleStyle?: AngleStyle;
  compass?: boolean | string[];
  copyDecimal?: boolean;
  decimal?: string;
  decimalPrecision?: number;
  degreeMark?: string;
  locale?: string | string[];
  minuteMark?: string;
  secondMark?: string;
  unsigned?: boolean;
  wrapAround?: boolean;
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
  private compassKeys: string[];
  private compassPoints: string[];
  private decimals = 0;
  private flipSign = false;
  private intAngle = 0;
  private leftDigits = 3;
  private _max: null | number = null;
  private _min: null | number = null;
  private _options: AngleEditorOptions = {};
  private outOfRange = false;
  private wrapAround = true;

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
      // TODO
    }

    return null;
  }

  protected applyPastedText(text: string): void {
    const newValue = this.parseText(text);

    if (newValue == null || isNaN(newValue) || newValue < this.minAngle || newValue > this.maxAngle)
      this.errorFlash();
    else
      this.value = newValue;
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

  get min(): null | number | string { return this._min; }
  @Input() set min(value: null | number | string) {
    if (this._min !== value) {
      const before = this.validateImpl(this.value);

      this._min = (value == null || value === '' ? null : toNumber(value));

      setTimeout(() => {
        this.updateDigits();
        const after = this.validateImpl(this.value);

        if (!isEqual(before, after))
          this.valueHasChanged(true);
      });
    }
  }

  protected get minAngle(): number {
    if (this._min != null)
      return this._min;
    else if (this.signIndex < 0 && this.compassIndex < 0)
      return 0;
    else
      return this.leftDigits < 3 ? -90 : -180;
  }

  get max(): null | number | string { return this._max; }
  @Input() set max(value: null | number | string) {
    if (this._max !== value) {
      const before = this.validateImpl(this.value);

      this._max = (value == null || value === '' ? null : toNumber(value));

      this.outOfRange = false;
      setTimeout(() => {
        this.updateDigits();
        const after = this.validateImpl(this.value);

        if (!isEqual(before, after))
          this.valueHasChanged(true);
      });
    }
  }

  protected get maxAngle(): number {
    if (this._max != null)
      return this._max;
    else if (this.signIndex < 0 && this.compassIndex < 0)
      return this.leftDigits < 3 ? 90 : 360 - Number.EPSILON * 1000;
    else
      return this.leftDigits < 3 ? 90 : 180 - (this.wrapAround ? Number.EPSILON * 1000 : 0);
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

    this.wrapAround = opts.wrapAround ?? (!opts.unsigned && style >= AngleStyle.DDD);

    if (isArray(opts.compass))
      this.compassPoints = opts.compass;
    else if (style < AngleStyle.DDD)
      this.compassPoints = ['S', 'N'];
    else
      this.compassPoints = ['W', 'E'];

    this.compassKeys = [];
    const pts = this.compassPoints;

    for (let i = 0; i < pts[0].length && pts[1].length; ++i) {
      if (pts[0].charAt(i) !== pts[1].charAt(i)) {
        this.compassKeys = [pts[0].charAt(i).toLocaleLowerCase(locale), pts[1].charAt(i).toLocaleLowerCase(locale)];
        break;
      }
    }

    const addDigits = (n: number, format?: string): void =>
      repeat(n, () => this.items.push({ value: 0, digit: true, editable: true, format }));

    if (!opts.compass && !opts.unsigned)
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
    let qlass = super.getClassForItem(item) ?? '';

    if (this.outOfRange && item.editable)
      qlass += ' bad-value';

    return qlass?.trim() || null;
  }

  private updateDigits(intAngle?: number, delta = 0, selection = -1): void {
    const programmatic = (intAngle === undefined);

    intAngle = (intAngle === undefined ? this.intAngle : intAngle);

    let angle = intAngle / this.angleDivisor;
    const field = delta === 0 ? 'value' : delta < 0 ? 'swipeBelow' : 'swipeAbove';

    if (angle < this.minAngle || angle > this.maxAngle) {
      if (delta === 0)
        this.outOfRange = true;

      if (delta !== 0 && selection >= 0)
        this.items[selection][field] = '\xA0';

      if (!programmatic) {
        angle = (angle < this.minAngle ? this.minAngle : this.maxAngle);
        intAngle = trunc(angle * this.angleDivisor);

        timer().subscribe(() => {
          this.errorFlash();
          this.setIntAngle(intAngle);
          this.updateDigits();
        });
      }

      return;
    }
    else if (delta === 0)
      this.outOfRange = false;

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

    if (this.signIndex >= 0) {
      if (this.flipSign && intAngle === 0)
        this.items[this.signIndex][field] = (this.items[this.signIndex][field] === '-' ? '+' : '-');
      else
        this.items[this.signIndex][field] = (intAngle < 0 ? '-' : '+');
    }
    else if (this.compassIndex >= 0) {
      if (this.flipSign && intAngle === 0)
        this.items[this.compassIndex][field] = (this.items[this.compassIndex][field] === this.compassPoints[0] ?
          this.compassPoints[1] : this.compassPoints[0]);
      else
        this.items[this.compassIndex][field] = this.compassPoints[intAngle < 0 ? 0 : 1];
    }
  }

  private getIntAngleFromDigits(): number {
    let intAngle = this.getDigits(this.decimalIndex, this.decimals);
    const div = this.angleDivisor;
    let sign = 1;

    intAngle += this.getDigits(this.degreeIndex, this.leftDigits) * div;
    intAngle += this.getDigits(this.minuteIndex, 2) * (div / 60);
    intAngle += this.getDigits(this.secondIndex, 2) * (div / 3600);

    if (this.signIndex >= 0 && this.items[this.signIndex].value === '-' ||
        this.compassIndex >= 0 && this.items[this.compassIndex].value === this.compassPoints[0])
      sign = -1;

    return sign * intAngle;
  }

  protected roll(sign: number, sel = this.selection, updateAngle = true): void {
    let change = 0;
    let intAngle = this.intAngle;
    const div = this.angleDivisor;

    if (this.outOfRange && intAngle / this.angleDivisor < this.minAngle)
      change = trunc(this.minAngle * this.angleDivisor - intAngle) * sign;
    else if (this.outOfRange && intAngle / this.angleDivisor > this.maxAngle)
      change = trunc(this.maxAngle * this.angleDivisor - intAngle) * sign;
    else if (sel === this.signIndex || sel === this.compassIndex) {
      this.flipSign = (intAngle === 0);
      change = -sign * intAngle * 2;
    }
    else if (this.degreeIndex <= sel && sel < this.degreeIndex + this.leftDigits)
      change = 10 ** (this.degreeIndex - sel + this.leftDigits - 1) * div;
    else if (this.minuteIndex <= sel && sel < this.minuteIndex + 2)
      change = 10 ** (this.minuteIndex - sel + 1) * (div / 60);
    else if (this.secondIndex <= sel && sel < this.secondIndex + 2)
      change = 10 ** (this.secondIndex - sel + 1) * (div / 3600);
    else if (this.decimalIndex <= sel && sel < this.decimalIndex + this.decimals)
      change = 10 ** (this.decimalIndex - sel + this.decimals - 1);

    intAngle = intAngle + sign * change;

    if (intAngle / this.angleDivisor < this.minAngle || intAngle / this.angleDivisor > this.maxAngle) {
      if (this.wrapAround) {
        if (this.signIndex < 0 && this.compassIndex < 0)
          intAngle = mod(intAngle, ceil(this.maxAngle * this.angleDivisor));
        else
          intAngle = mod2(intAngle, ceil(this.maxAngle * this.angleDivisor * 2));

        if (updateAngle)
          this.warningFlash(true);
      }
      else {
        if (updateAngle)
          this.errorFlash();

        return;
      }
    }

    if (updateAngle && change !== 0)
      this.setIntAngle(intAngle, true);
    else
      this.updateDigits(intAngle, updateAngle ? 0 : sign);

    this.flipSign = false;
  }

  protected onKey(key: string): void {
    const keyLc = key.toLocaleLowerCase(this._options.locale);
    const editable = !this.disabled && !this.viewOnly;

    if (editable &&
        ((this.selection === this.signIndex && ' -+='.includes(key)) ||
         (this.selection === this.compassIndex && (key === '1' || key === '2' || this.compassKeys.includes(keyLc)))))
      this.digitTyped(keyLc.charCodeAt(0), keyLc);
    else
      super.onKey(key);
  }

  protected digitTyped(charCode: number, key: string): void {
    const i = this.items;
    const sel = this.selection;
    const origValue = i[sel].value;
    let newValue: number | string = origValue;

    if (sel === this.compassIndex) {
      const [neg, pos] = this.compassPoints;

      if (i[this.compassIndex].value === neg && (key === this.compassKeys[1] || key === '1'))
        newValue = neg;
      else if (i[this.compassIndex].value === pos && (key === this.compassKeys[0] || key === '2'))
        newValue = pos;
      else {
        if ('12'.indexOf(key) < 0 && !this.compassKeys.includes(key))
          this.errorFlash();

        return;
      }
    }
    else if (sel === this.signIndex) {
      if (i[this.signIndex].value === '-' && (key === ' ' || key === '+' || key === '='))
        newValue = '+';
      else if (i[this.signIndex].value === '+' && key === '-')
        newValue = '-';
      else {
        if (' +=-'.indexOf(key) < 0)
          this.errorFlash();

        return;
      }
    }
    else if (48 <= charCode && charCode < 58)
      newValue = charCode - 48;
    else {
      this.errorFlash();
      return;
    }

    if (newValue === origValue && !this.outOfRange) {
      this.cursorForward();
      return;
    }

    if (((sel === this.minuteIndex || sel === this.secondIndex) && newValue > 5) ||
        (sel === this.degreeIndex && this.leftDigits > 2 && newValue > (this.wrapAround ? 1 : 3))) {
      this.errorFlash();
      return;
    }

    i[sel].value = newValue;

    let newIntAngle = this.getIntAngleFromDigits();
    const angle = newIntAngle / this.angleDivisor;

    if (angle < this.minAngle || angle > this.maxAngle) {
      if (!this.outOfRange && sel !== this.degreeIndex && sel !== this.minuteIndex && sel !== this.secondIndex) {
        i[sel].value = origValue;
        this.errorFlash();
        return;
      }
      else if (angle < this.minAngle)
        newIntAngle = trunc(this.minAngle * this.angleDivisor);
      else
        newIntAngle = trunc(this.maxAngle * this.angleDivisor);

      this.updateDigits(newIntAngle);
    }

    this.setIntAngle(newIntAngle, true);
    this.cursorForward();
  }

  getValueAsText(): string {
    if (this._options.copyDecimal ||
        this._options.angleStyle === AngleStyle.DD || this._options.angleStyle === AngleStyle.DDD)
      return this.value.toString();
    else
      return this.items.map(item => item.value.toString()).join('');
  }

  private parseText(text: string): number {
    text = text.trim().toLowerCase().replace(',', '.').replace(/[\u2212\uFE63\uFF0D]/g, '-').replace(/[\uFE62\uFF0B]/g, '+');

    if (/^[-+.\d]+°?$/.test(text))
      return toNumber(text.replace('°', ''), NaN);
    else {
      let sign = text.startsWith('-') ? -1 : 1;

      text = text.replace(/^[-+]/, '');

      if (text.endsWith(this.compassPoints[0].toLowerCase())) {
        sign = -1;
        text = text.slice(0, -this.compassPoints[0].length).trim();
      }
      else if (text.endsWith(this.compassKeys[0])) {
        sign = -1;
        text = text.slice(0, -1).trim();
      }
      else if (text.endsWith(this.compassPoints[1].toLowerCase()))
        text = text.slice(0, -this.compassPoints[0].length).trim();
      else if (text.endsWith(this.compassKeys[1]))
        text = text.slice(0, -1).trim();

      if (/^[., °"“”`'‘’dms\d]+$/.test(text)) {
        const parts = text.split(/([\D+])/).map(part => part.trim());
        const values: number[] = [];
        let hasDecimal = false;

        for (let i = 0; i < parts.length; ++i) {
          const part = parts[i];

          if (i % 2 === 0) {
            if (hasDecimal) {
              values[values.length - 1] = toNumber((last(values) ?? '0') + '.' + part);
              break;
            }
            else
              values.push(toNumber(part));
          }
          else if (part === '.')
            hasDecimal = true;
        }

        return sign * (values[0] + (values[1] ?? 0) / 60 + (values[2] ?? 0) / 3600);
      }
    }

    return null;
  }
}
