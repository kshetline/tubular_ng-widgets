import { ChangeDetectorRef, Component, forwardRef, Injector, Input, OnInit } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, NG_VALUE_ACCESSOR } from '@angular/forms';
import ttime, {
  DateAndTime, DateTime, DateTimeField, getISOFormatDate, newDateTimeFormat, parseISODateTime, Timezone
} from '@tubular/time';
import { abs, ceil, floor, max, min, mod } from '@tubular/math';
import {
  clone, convertDigits, convertDigitsToAscii, getFontMetrics, getTextWidth, isAndroid, isArray, isChrome, isEqual,
  isIOS, isNumber, isString, padLeft, repeat, toBoolean
} from '@tubular/util';
import { timer } from 'rxjs';
import {
  BACKGROUND_ANIMATIONS, defaultLocale, DigitSequenceEditorDirective, FORWARD_TAB_DELAY, hasIntl, SequenceItemInfo
} from '../digit-sequence-editor/digit-sequence-editor.directive';
import { TimeEditorLimit } from './time-editor-limit';
import parse = ttime.parse;

export enum DateFieldOrder { PER_LOCALE, YMD, DMY, MDY }
export enum DateTimeStyle { DATE_AND_TIME, DATE_ONLY, TIME_ONLY }
export enum HourStyle { PER_LOCALE, HOURS_24, AM_PM }
export enum MeridiemStyle { PER_LOCALE, TRAILING, LEADING }
export enum YearStyle { POSITIVE_ONLY, AD_BC, SIGNED }

export interface TimeEditorOptions {
  dateFieldOrder?: DateFieldOrder;
  dateFieldSeparator?: string;
  dateTimeSeparator?: string;
  dateTimeStyle?: DateTimeStyle;
  decimal?: string;
  eraSeparator?: string;
  hourStyle?: HourStyle | string[];
  locale?: string | string[];
  meridiemStyle?: MeridiemStyle;
  millisDigits?: number;
  numbering?: string;
  showDstSymbol?: boolean;
  showOccurrence?: boolean;
  showSeconds?: boolean;
  showUtcOffset?: boolean;
  timeFieldSeparator?: string;
  timeFirst?: string;
  twoDigitYear?: boolean;
  yearStyle?: YearStyle | string[];
}

const OCC2 = '\u200A\u2082\u200A';
const ISO_T = '\u200AT\u200A';
const NO_BREAK_SPACE = '\u00A0';
const platformNativeDateTime = (isIOS() || (isAndroid() && isChrome()));
const RTL_CHECK = /[\u0590-\u07BF\u0860-\u08FF\u200F\u2067\u202B\u202E\uFB1D-\uFDCF\uFDF0-\uFDFF\uFE70-\uFEFF]/;

export const OPTIONS_DATE_ONLY: TimeEditorOptions = {
  dateTimeStyle: DateTimeStyle.DATE_ONLY,
};

export const OPTIONS_ISO: TimeEditorOptions = {
  hourStyle: HourStyle.HOURS_24,
  dateFieldOrder: DateFieldOrder.YMD,
  dateFieldSeparator: '-',
  dateTimeSeparator: ISO_T,
  dateTimeStyle: DateTimeStyle.DATE_AND_TIME,
  decimal: '.',
  numbering: 'latn',
  showSeconds: true,
  timeFieldSeparator: ':',
  twoDigitYear: false
};

export const OPTIONS_ISO_DATE: TimeEditorOptions = {
  dateFieldOrder: DateFieldOrder.YMD,
  dateFieldSeparator: '-',
  dateTimeStyle: DateTimeStyle.DATE_ONLY,
  numbering: 'latn',
  twoDigitYear: false
};

const namedOptions: Record<string, TimeEditorOptions> = {
  date_only: OPTIONS_DATE_ONLY,
  iso: OPTIONS_ISO,
  iso_date: OPTIONS_ISO_DATE
};

type TimeFormat = 'date' | 'time' | 'datetime-local';

@Component({
  selector: 'tbw-time-editor',
  animations: [BACKGROUND_ANIMATIONS],
  templateUrl: '../digit-sequence-editor/digit-sequence-editor.directive.html',
  styleUrls: ['../digit-sequence-editor/digit-sequence-editor.directive.scss', './time-editor.component.scss'],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeEditorComponent), multi: true },
              { provide: NG_VALIDATORS, useExisting: forwardRef(() => TimeEditorComponent), multi: true }]
})
export class TimeEditorComponent extends DigitSequenceEditorDirective<number> implements OnInit {
  static get supportsNativeDateTime(): boolean { return platformNativeDateTime; }

  private amPmKeys = ['a', 'p'];
  private amPmStrings = ['AM', 'PM'];
  private baseDigit = '0';
  private centuryBase = DateTime.getDefaultCenturyBase();
  private dateTime = new DateTime();
  private eraKeys = ['b', 'a'];
  private eraStrings = ['BC', 'AD'];
  private explicitMinYear = false;
  private firstTouch = true;
  private hasLocalTimeFocus = false;
  private _gregorianChangeDate = '1582-10-15';
  private localTime: HTMLInputElement;
  private localTimeValue: string;
  private _max: Date | number | string;
  private maxLimit = new TimeEditorLimit('9999');
  private _min: Date | number | string;
  private minLimit = new TimeEditorLimit('-9999');
  private _nativeDateTime = false;
  private _options: TimeEditorOptions = {};
  private outOfRange = false;
  private readonly originalMinYear = this.minLimit.year;
  private rtlMark = false;
  private sizerDigit = '0';
  private _tai = false;
  private twoDigitYear = false;
  private yearDigits = 4;

  private eraIndex = -1;
  private signIndex = -1;
  private yearIndex = -1;
  private monthIndex = -1;
  private dayIndex = -1;
  private hourIndex = -1;
  private minuteIndex = -1;
  private secondIndex = -1;
  private millisIndex = -1;
  private amPmIndex = -1;
  private occIndex = -1;
  private offsetIndex = -1;
  private dstIndex = -1;

  localTimeFormat: TimeFormat = 'datetime-local';
  localTimeMin: string;
  localTimeMax: string;

  constructor(injector: Injector, private cd: ChangeDetectorRef) {
    super(injector);
    this.useAlternateTouchHandling = false;
  }

  get value(): number { return this._tai ? this.dateTime.taiMillis : this.dateTime.utcMillis; }
  set value(newValue: number) {
    this.setValue(newValue, true);
  }

  protected validateImpl(_value: number, _control?: AbstractControl): { [key: string]: any } {
    if (this.outOfRange) {
      const year = this.dateTime.wallTime.year;

      if (year < this.minYear())
        return { min: { message: `Year must be at least ${this.minYear()}` } };
      else if (year > this.maxYear())
        return { max: { message: `Year must not be after ${this.maxYear()}` } };
      else if (this.minLimit.compare(this.dateTime) > 0)
        return { min: { message: `Date/time must be on or after ${this.minLimit.text}` } };
      else if (this.maxLimit.compare(this.dateTime) < 0)
        return { max: { message: `Date/time must be on or after ${this.maxLimit.text}` } };

      return { invalid: true }; // TODO: Make more specific with min/max response
    }

    return null;
  }

  protected applyPastedText(text: string): void {
    const parsed = this.parseText(text);

    if (parsed == null)
      this.errorFlash();
    else if (isNumber(parsed)) {
      this.dateTime.taiMillis = parsed;
      this.outOfRange = false;
      this.reportValueChange();
      this.updateDigits();
    }
    else {
      this.dateTime.wallTime = parsed;
      this.outOfRange = false;
      this.reportValueChange();
      this.updateDigits();
    }
  }

  protected getClipboardText(): string {
    return this.getValueAsText();
  }

  get options(): string | TimeEditorOptions | (string | TimeEditorOptions)[] { return this._options; }
  @Input() set options(newValue: string | TimeEditorOptions | (string | TimeEditorOptions)[]) {
    if (isArray(newValue)) {
      const orig = newValue;

      if (isString(orig[0]))
        newValue = clone(namedOptions[orig[0].toLowerCase()] ?? {});
      else
        newValue = clone(orig[0]);

      orig.forEach((opt, index) => {
        if (index > 0) {
          if (isString(opt))
            opt = namedOptions[opt.toLowerCase()] ?? {};

          Object.assign(newValue, opt);
        }
      });
    }
    else if (isString(newValue))
      newValue = namedOptions[newValue.toLowerCase()] ?? {};

    if (!isEqual(this._options, newValue)) {
      this._options = clone(newValue);
      this.createDigits();
      this.createDisplayOrder();
    }
  }

  get tai(): boolean | string { return this._tai; }
  @Input() set tai(newValue: boolean | string) {
    if (isString(newValue))
      newValue = toBoolean(newValue, false, true);

    if (this._tai !== newValue) {
      this._tai = newValue;
      this.reportValueChange();
    }
  }

  onLocalTimeChange(): void {
    const newValue = this.localTime.value;

    if (this.localTimeValue !== newValue) {
      this.localTimeValue = newValue;

      let newTime: number;

      if (newValue) {
        const w = this.dateTime.wallTime;
        let $;

        if (($ = /(\d\d\d\d)-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(newValue))) {
          const d = $.slice(1).map(n => Number(n));

          if ($[4] == null) {
            d[3] = w.hrs;
            d[4] = w.min;
          }

          newTime = new DateTime({ y: d[0], m: d[1], d: d[2], hrs: d[3], min: d[4], sec: 0 },
            this.timezone, this._gregorianChangeDate).utcMillis;
        }
        else if (($ = /(\d\d):(\d\d)/.exec(newValue))) {
          const t = $.slice(1).map(n => Number(n));

          newTime = new DateTime({ y: w.y, m: w.m, d: w.d, hrs: t[0], min: t[1], sec: 0 },
            this.timezone, this._gregorianChangeDate).utcMillis;
        }
      }
      else
        newTime = Date.now();

      if (newTime !== undefined && !isNaN(newTime))
        this.value = newTime;

      if (!this.localTimeValue)
        setTimeout(() => this.updateLocalTime());
    }
  }

  ngOnInit(): void {
    super.ngOnInit();
    this.createLocalTimeInput();
    this.localTime?.setAttribute('tabindex', this.useAlternateTouchHandling ? this.tabindex : '-1');
  }

  onLocalTimeFocus(value: boolean): void {
    if (value && this.viewOnly || this.initialNativeDateTimePrompt())
      return;

    if (this.hasLocalTimeFocus !== value) {
      this.hasLocalTimeFocus = value;
      this.checkFocus();
    }
  }

  private createLocalTimeInput(): void {
    if (!platformNativeDateTime)
      return;

    this.localTime = document.createElement('input');
    this.localTime.type = this.localTimeFormat;
    this.localTime.autocomplete = 'off';
    this.localTime.setAttribute('autocapitalize', 'off');
    this.localTime.setAttribute('autocomplete', 'off');
    this.localTime.setAttribute('autocorrect', 'off');
    this.localTime.setAttribute('tabindex', this.disabled ? '-1' : this.tabindex);
    this.localTime.setAttribute('min', this.localTimeMin);
    this.localTime.setAttribute('max', this.localTimeMax);
    this.localTime.style.position = 'absolute';
    this.localTime.style.opacity = '0';
    (this.localTime.style as any)['caret-color'] = 'transparent';
    (this.localTime.style as any)['pointer-events'] = 'none';
    this.localTime.style.left = '0';
    this.localTime.style.top = '-6px';

    this.localTime.addEventListener('focus', () => this.onLocalTimeFocus(true));
    this.localTime.addEventListener('blur', () => this.onLocalTimeFocus(false));
    this.localTime.addEventListener('input', () => this.onLocalTimeChange());

    this.wrapper.parentElement.appendChild(this.localTime);
    this.wrapper.setAttribute('tabindex', '-1');
  }

  protected hasAComponentInFocus(): boolean {
    return super.hasAComponentInFocus() || this.hasLocalTimeFocus;
  }

  protected checkFocus(): void {
    if (this.initialNativeDateTimePrompt())
      return;

    super.checkFocus();
  }

  protected gainedFocus(): void {
    if (this.initialNativeDateTimePrompt())
      return;

    if (!this.hasLocalTimeFocus && this.isNativeDateTimeActive() && performance.now() > this.lastTabTime + FORWARD_TAB_DELAY)
      this.localTime?.focus();
  }

  protected lostFocus(): void {
    this.touched();
  }

  protected adjustState(): void {
    super.adjustState();

    this.localTime?.setAttribute('disabled',
        this.disabled || this.viewOnly || !this.useAlternateTouchHandling ? '' : null);
    this.localTime?.setAttribute('tabindex', this.disabled ? '-1' : this.tabindex);
  }

  onTouchStart(index: number, evt: TouchEvent): void {
    if (!this.initialNativeDateTimePrompt(evt))
      super.onTouchStart(index, evt);
  }

  onTouchMove(evt: TouchEvent): void {
    if (!this.nativeDateTime)
      super.onTouchMove(evt);
  }

  protected initialNativeDateTimePrompt(evt?: Event): boolean {
    if (TimeEditorComponent.supportsNativeDateTime && this.promptForNative &&
        !this.disabled && !this.viewOnly && this.firstTouch) {
      this.firstTouch = false;

      if (this.promptForNative && this.promptForNative()) {
        if (evt)
          evt.preventDefault();

        return true;
      }
    }

    return false;
  }

  protected onTouchStartAlternate(index: number, _event: TouchEvent): void {
    let format: TimeFormat = 'datetime-local';

    if (isIOS())
      format = (this.hourIndex < 0 && index < this.hourIndex ? 'date' : 'time'); // TODO: Handle time-first formats

    if (this.localTimeFormat !== format) {
      // Changing the format of the input (using the "type" attribute) sets off a number of updates
      // that don't stabilize very well if we leave it up to Angular's change detection process to do
      // all of the updating, so we'll update all of the changing input attributes and input value
      // directly, all in one go.
      this.localTimeFormat = format;
      this.adjustLocalTimeMin();
      this.adjustLocalTimeMax();
      this.updateLocalTime();
      this.localTime.type = format;
      this.localTime.min = this.localTimeMin;
      this.localTime.max = this.localTimeMax;
      this.localTime.value = this.localTimeValue;
      this.cd.detectChanges();
    }

    this.localTime.focus();
    setTimeout(() => this.localTime.click(), 250);
  }

  writeValue(newValue: number): void {
    this.setValue(newValue);
  }

  private setValue(newValue: number, doCallback = false): void {
    if (newValue == null)
      return;

    let tai = this._tai;

    if (newValue as any instanceof DateTime) {
      tai = true;
      newValue = (newValue as any as DateTime).taiMillis;
    }
    else if (newValue as any instanceof Date) {
      tai = false;
      newValue = (newValue as any as Date).getTime();
    }
    else if (isString(newValue)) {
      tai = true;
      newValue = new DateTime(newValue as any as string, this.dateTime.timezone, this.dateTime.locale,
        this.dateTime.getGregorianChange()).taiMillis;
    }

    if ((tai && this.dateTime.taiMillis !== newValue) || (!tai && this.dateTime.utcMillis !== newValue)) {
      if (tai)
        this.dateTime.taiMillis = newValue;
      else
        this.dateTime.utcMillis = newValue;

      this.updateDigits();

      if (doCallback)
        this.reportValueChange();
    }
  }

  setDisabledState?(isDisabled: boolean): void {
    super.setDisabledState(isDisabled);
    this.displayState = (isDisabled ? 'disabled' : (this.viewOnly ? 'viewOnly' : 'normal'));
  }

  get wallTime(): DateAndTime { return this.dateTime.wallTime; }

  get min(): Date | number | string { return this._min; }
  @Input() set min(value: Date | number | string) {
    if (this._min !== value) {
      const before = this.validateImpl(this.value);

      this._min = value;
      this.minLimit = new TimeEditorLimit(value, true, this.tai as boolean);

      if (this.minLimit.wallTime == null && value != null && value !== '') {
        this.explicitMinYear = true;
        this.centuryBase = this.minLimit.year;
      }
      else
        this.explicitMinYear = false;

      this.adjustLocalTimeMin();
      this.outOfRange = false;
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

      this._max = value;
      this.maxLimit = new TimeEditorLimit(value, false, this.tai as boolean);
      this.adjustLocalTimeMax();
      this.outOfRange = false;
      setTimeout(() => {
        this.updateDigits();
        const after = this.validateImpl(this.value);

        if (!isEqual(before, after))
          this.valueHasChanged(true);
      });
    }
  }

  private adjustLocalTimeMin(): void {
    if (this.localTimeFormat === 'time' || (this.minLimit.year == null && this.minLimit.wallTime == null))
      this.localTimeMin = null;
    else if (this.minLimit.year != null)
      this.localTimeMin = padLeft(max(this.minLimit.year, 1), 4, '0') + '-01-01' + (this.localTimeFormat === 'date' ? '' : 'T00:00');
    else if (this.minLimit.year >= 1)
      this.localTimeMin = getISOFormatDate(this.minLimit.year, this.minLimit.wallTime.m, this.minLimit.wallTime.d);
    else
      this.localTimeMin = '0000-01-01';

    this.localTime?.setAttribute('min', this.localTimeMin);
  }

  private adjustLocalTimeMax(): void {
    if (this.localTimeFormat === 'time')
      this.localTimeMax = null;
    else if (this.maxLimit.year != null)
      this.localTimeMax = padLeft(this.maxLimit.year, 4, '0') + '-12-31' + (this.localTimeFormat === 'date' ? '' : 'T23:59');
    else if (this.maxLimit.year >= 1)
      this.localTimeMax = getISOFormatDate(this.maxLimit.year, this.maxLimit.wallTime.m, this.maxLimit.wallTime.d);
    else
      this.localTimeMax = '0000-01-01';

    this.localTime?.setAttribute('max', this.localTimeMax);
  }

  get timezone(): Timezone | string { return this.dateTime.timezone; }
  @Input() set timezone(newZone: Timezone | string) {
    if (this.dateTime.timezone !== newZone) {
      this.dateTime.timezone = newZone as any;
      this.updateDigits();
    }
  }

  // eslint-disable-next-line accessor-pairs
  @Input() set gregorianChangeDate(value: string) {
    if (this._gregorianChangeDate !== value) {
      this._gregorianChangeDate = value;
      this.dateTime.setGregorianChange(value);
      this.updateDigits();
    }
  }

  @Input() promptForNative: () => boolean;

  get nativeDateTime(): boolean { return this._nativeDateTime; }
  @Input() set nativeDateTime(newValue: boolean) {
    if (this._nativeDateTime !== newValue) {
      this._nativeDateTime = newValue;
      this.useAlternateTouchHandling = this.selectionHidden = newValue && TimeEditorComponent.supportsNativeDateTime;

      if (this.hiddenInput)
        this.hiddenInput.disabled = !!this.disabled || this.useAlternateTouchHandling;

      if (this.localTime && TimeEditorComponent.supportsNativeDateTime)
        this.localTime.setAttribute('tabindex', newValue ? '0' : '-1');

      if (newValue) {
        let wallTime = this.dateTime.wallTime;

        this.min = max(this.originalMinYear, 1).toString();

        if (wallTime.y < this.minLimit.year) {
          wallTime = { y: this.minLimit.year, m: 1, d: 1, hrs: 0, min: 0, sec: 0 };
          this.dateTime.wallTime = wallTime;
          this.reportValueChange();
          this.updateDigits();
        }
      }
      else
        this.min = this.originalMinYear.toString();

      this.cd.detectChanges();
    }
  }

  isNativeDateTimeActive(): boolean {
    return DigitSequenceEditorDirective.touchHasOccurred && this.nativeDateTime && TimeEditorComponent.supportsNativeDateTime;
  }

  protected createHiddenInput(): void {
    super.createHiddenInput();

    if (this.hiddenInput)
      this.hiddenInput.disabled = !!this.disabled || this.useAlternateTouchHandling;
  }

  protected createDigits(): void {
    this.items.length = 0;
    this.eraIndex = -1;
    this.signIndex = -1;
    this.yearIndex = -1;
    this.monthIndex = -1;
    this.dayIndex = -1;
    this.hourIndex = -1;
    this.minuteIndex = -1;
    this.secondIndex = -1;
    this.millisIndex = -1;
    this.amPmIndex = -1;
    this.occIndex = -1;
    this.offsetIndex = -1;
    this.dstIndex = -1;
    this.rtlMark = false;

    const steps: string[] = [];
    const dateSteps: string[] = [];
    const timeSteps: string[] = [];
    const opts = this._options;
    const hasDate = (opts.dateTimeStyle !== DateTimeStyle.TIME_ONLY);
    const hasTime = (opts.dateTimeStyle !== DateTimeStyle.DATE_ONLY);
    const locale = opts.locale || defaultLocale;
    const extendLocale = (l: string): string => l + '-u-ca-gregory' + (opts.numbering ? '-nu-' + opts.numbering : '');
    const localeExt = isArray(locale) ? locale.map(l => extendLocale(l)) : (locale && extendLocale(locale));
    const decimal = opts.decimal ||
      (hasIntl && convertDigitsToAscii(Intl.NumberFormat(locale).format(1.2)).replace(/\d/g, '').charAt(0)) || '.';
    let es = opts.eraSeparator ?? NO_BREAK_SPACE;
    let ds = opts.dateFieldSeparator ?? '/';
    let ts = opts.timeFieldSeparator ?? ':';
    let dts = opts.dateTimeSeparator ?? NO_BREAK_SPACE;
    let leadingMeridian = opts.meridiemStyle === MeridiemStyle.LEADING;
    const baseDigit: string[] = [];

    this.rtl = RTL_CHECK.test(new Date().toLocaleString(locale, { month: 'long'}));

    if (hasDate) {
      let sampleDate = new DateTime('3333-11-22Z', 'UTC', locale).format('IS');
      let dfo = opts.dateFieldOrder ?? DateFieldOrder.PER_LOCALE;

      this.twoDigitYear = opts.yearStyle !== YearStyle.AD_BC && opts.yearStyle !== YearStyle.SIGNED &&
        (opts.twoDigitYear ?? !sampleDate.includes('3333'));
      this.yearDigits = (this.twoDigitYear ? 2 : 4);
      this.rtl = this.rtl || RTL_CHECK.test(sampleDate);
      this.rtlMark = this.rtl && sampleDate.includes('\u200F');
      ds = opts.dateFieldSeparator ||
        (/\d(\u200F?\D)\d/.exec(convertDigitsToAscii(sampleDate, baseDigit)) ?? [])[1] || '/';

      sampleDate = convertDigitsToAscii(sampleDate);

      if (dfo === DateFieldOrder.PER_LOCALE) {
        if (/3.*1.*2/.test(sampleDate))
          dfo = DateFieldOrder.YMD;
        else if (/2.*1.*3/.test(sampleDate))
          dfo = DateFieldOrder.DMY;
        else
          dfo = DateFieldOrder.MDY;
      }

      switch (dfo) {
        case DateFieldOrder.YMD: dateSteps.push('year', 'ds', 'month', 'ds', 'day'); break;
        case DateFieldOrder.DMY: dateSteps.push('day', 'ds', 'month', 'ds', 'year'); break;
        default: dateSteps.push('month', 'ds', 'day', 'ds', 'year');
      }

      if (opts.yearStyle === YearStyle.SIGNED)
        dateSteps.splice(dateSteps.indexOf('year'), 0, 'sign');
      else if (opts.yearStyle === YearStyle.AD_BC || isArray(opts.yearStyle)) {
        dateSteps.push('era');

        if (hasIntl && opts.eraSeparator == null) {
          const era = convertDigitsToAscii(newDateTimeFormat(localeExt, { era: 'short' }).format(0));
          const sample = convertDigitsToAscii(newDateTimeFormat(localeExt,
                            { year: 'numeric', era: 'short' }).format(0)).replace(era, 'xxx');

          es = (/\d([\Dx]+)xxx/.exec(sample) ?? ['', NO_BREAK_SPACE])[1].replace(/\s+/g, NO_BREAK_SPACE);
        }

        if (isArray(opts.yearStyle))
          this.eraStrings = clone(opts.yearStyle);
        else {
          const bc = new DateTime('-0001-01-01', 'UTC', locale).format('N');
          const ad = new DateTime(0, 'UTC', locale).format('N');

          this.eraStrings = [bc, ad];
        }

        this.eraKeys = ['b', 'a'];
        const eras = this.eraStrings;

        for (let i = 0; i < eras[0].length && eras[1].length; ++i) {
          if (eras[0].charAt(i) !== eras[1].charAt(i)) {
            this.eraKeys = [eras[0].charAt(i).toLocaleLowerCase(locale), eras[1].charAt(i).toLocaleLowerCase(locale)];
            break;
          }
        }
      }
    }

    let dateRtl = false;

    if (hasTime) {
      const sampleTime = new DateTime(0, 'UTC', locale).format('IxS');

      dateRtl = RTL_CHECK.test(sampleTime);
      this.rtl = this.rtl || dateRtl;
      ts = opts.timeFieldSeparator ||
        convertDigitsToAscii(sampleTime, baseDigit).replace(/(^\D+)|[\d\s\u2000-\u200F]/g, '').charAt(0) || ':';
      timeSteps.push('hour', 'ts', 'minute');

      if (opts.showSeconds || opts.millisDigits > 0)
        timeSteps.push('ts', 'second');

      if (opts.millisDigits > 0)
        timeSteps.push('millis');

      let amPm = false;

      if (opts.hourStyle == null || opts.hourStyle === HourStyle.PER_LOCALE ||
          opts.hourStyle === HourStyle.AM_PM) {
        const am = new DateTime(0, 'UTC', locale).format('A');

        if (opts.hourStyle === HourStyle.AM_PM || sampleTime.includes(am)) {
          amPm = true;
          this.amPmStrings = [am, new DateTime('1970-01-01T13:00', 'UTC', locale).format('A')];
        }

        if (opts.meridiemStyle == null || opts.meridiemStyle === MeridiemStyle.PER_LOCALE) {
          const sample = new DateTime(0, 'UTC', locale).format('IxS');
          const $ = /\d/.exec(sample);
          const digitIndex = $?.index ?? -1;
          const amIndex = sample.indexOf(this.amPmStrings[0]);

          if (amIndex >= 0 && amIndex < digitIndex)
            leadingMeridian = true;
        }
      }
      else if (isArray(opts.hourStyle)) {
        amPm = true;
        this.amPmStrings = clone(opts.hourStyle ?? ['AM', 'PM']);
      }

      if (amPm) {
        if (leadingMeridian)
          timeSteps.splice(0, 0, 'amPm');
        else
          timeSteps.push('aps', 'amPm');

        this.amPmKeys = [];
        const aps = this.amPmStrings;

        for (let i = 0; i < aps[0].length && aps[1].length; ++i) {
          if (aps[0].charAt(i) !== aps[1].charAt(i)) {
            this.amPmKeys = [aps[0].charAt(i).toLocaleLowerCase(locale), aps[1].charAt(i).toLocaleLowerCase(locale)];
            break;
          }
        }
      }

      if (opts.showOccurrence)
        timeSteps.push('occ');

      if (opts.showUtcOffset)
        timeSteps.push('off');

      if (opts.showDstSymbol)
        timeSteps.push('dst');
    }

    if (this.rtlMark) {
      const hasEra = dateSteps.includes('era');

      if (hasEra)
        dateSteps.splice(-1, 1);

      dateSteps.reverse();

      if (hasEra)
        dateSteps.push('era');
    }

    if (hasIntl && hasTime && hasDate && opts.dateTimeSeparator == null) {
      const sample = convertDigitsToAscii(
        newDateTimeFormat(localeExt,
          { day: 'numeric', hour: 'numeric', hour12: false, hourCycle: 'h23' } as any).format(0));

      dts = (/\d(\D+)\d/.exec(sample) ?? ['', NO_BREAK_SPACE])[1];

      if (!new DateTime(0, 'UTC', locale).format('ISS').includes(dts))
        dts = NO_BREAK_SPACE;
      else
        dts = dts.replace(/\s+/g, NO_BREAK_SPACE);
    }

    if (opts.timeFirst && hasTime && hasDate)
      steps.push(...timeSteps, 'dts', ...dateSteps);
    else {
      if (hasDate)
        steps.push(...dateSteps);

      if (hasTime) {
        if (hasDate)
          steps.push('dts');

        steps.push(...timeSteps);
      }
    }

    const addDigits = (n: number, format?: string): void =>
      repeat(n, () => this.items.push({ value: 0, digit: true, editable: true, format }));

    for (const step of steps) {
      const i = this.items.length;

      switch (step) {
        case 'year': this.yearIndex = i; addDigits(this.yearDigits); break;
        case 'era':
          this.items.push({ value: es, static: true, width: '0.25em' });
          this.eraIndex = i + 1;
          this.items.push({ value: this.eraStrings[1], editable: true, format: 'N', sizer: this.eraStrings.join('\n') });
          break;
        case 'sign':
          this.signIndex = i;
          this.items.push({ value: NO_BREAK_SPACE, editable: true, monospaced: true, sign: true, sizer: '-' });
          break;
        case 'ds': this.items.push({ value: ds, bidi: true, static: true }); break;
        case 'month': this.monthIndex = i; addDigits(2, 'M'); break;
        case 'day': this.dayIndex = i; addDigits(2, 'D'); break;
        case 'dts': this.items.push({ value: dts, static: true,
                                      opacity: dts === ISO_T ? 0.15 : 1,
                                      width: dts === NO_BREAK_SPACE ?  '0.6em' : undefined }); break;
        case 'hour': this.hourIndex = i; addDigits(2, steps.includes('amPm') ? 'h' : 'H'); break;
        case 'aps': this.items.push({ value: NO_BREAK_SPACE, static: true, width: '0.25em' }); break;
        case 'amPm':
          this.amPmIndex = i;
          this.items.push({ value: this.amPmStrings[0], editable: true, format: 'A', sizer: this.amPmStrings.join('\n') });
          break;
        case 'ts': this.items.push({ value: ts, bidi: true, static: true }); break;
        case 'minute': this.minuteIndex = i; addDigits(2, 'm'); break;
        case 'second': this.secondIndex = i; addDigits(2, 's'); break;
        case 'millis':
          this.items.push({ value: decimal, static: true });
          this.millisIndex = i + 1;
          addDigits(min(opts.millisDigits, 3), 'S'); break;
        case 'occ':
          this.occIndex = i;
          this.items.push({ value: NO_BREAK_SPACE, format: 'r', indicator: true, sizer: OCC2, name: '2occ', deltaY: -0.2 });
          break;
        case 'off':
          this.offsetIndex = i;
          this.items.push({ value: '+00:00', format: 'Z', indicator: true, monospaced: true });
          break;
        case 'dst':
          this.dstIndex = i;
          this.items.push({ value: NO_BREAK_SPACE, format: 'v', indicator: true, sizer: '^\n§\n#\n~\n?\n\u2744' });
          break;
      }
    }

    if (this.yearIndex >= 0) {
      if (this.twoDigitYear) {
        this.items[this.yearIndex].format = 'YY';

        if (!this.explicitMinYear)
          this.centuryBase = DateTime.getDefaultCenturyBase();
        else
          this.centuryBase = this.minLimit.year;
      }
      else if (this.eraIndex >= 0)
        this.items[this.yearIndex].format = 'y';
      else
        this.items[this.yearIndex].format = 'Y';
    }

    if (steps.includes('second'))
      this.selection = this.secondIndex + 1;
    else if (steps.includes('minute'))
      this.selection = this.minuteIndex + 1;
    else if (steps.includes('day'))
      this.selection = this.dayIndex + 1;

    this.items.push({ divider: true });
    this.items.push({ spinner: true });

    if (opts.numbering)
      convertDigitsToAscii(new Intl.NumberFormat(locale + '-u-nu-' + opts.numbering).format(0), baseDigit);

    this.baseDigit = baseDigit[0] ?? '0';
    this.findSizerDigitAndHeight(this.items[this.amPmIndex]?.sizer, this.items[this.eraIndex]?.sizer);
    this.updateDigits();
  }

  private findSizerDigitAndHeight(...textItems: string[]): void {
    this.baselineShift = '0';
    this.lineHeight = undefined;
    this.sizerDigit = this.baseDigit;

    if (!this.wrapper || !this.emSizer)
      return;

    const baseCode = this.baseDigit.charCodeAt(0);
    let maxWidth = getTextWidth(this.sizerDigit, this.wrapper);
    // eslint-disable-next-line prefer-const
    let { lineHeight, fullAscent, descent, extraAscent, extraDescent } = getFontMetrics(this.wrapper, this.baseDigit);

    for (let i = 1; i <= 9; ++i) {
      const digit = String.fromCodePoint(baseCode + i);
      const width = getTextWidth(digit, this.wrapper);
      const metrics = getFontMetrics(this.wrapper, digit);

      if (maxWidth < width) {
        maxWidth = width;
        this.sizerDigit = digit;
      }

      extraAscent = max(metrics.extraAscent, extraAscent);
      extraDescent = max(metrics.extraDescent, extraDescent);
    }

    const textChars = (textItems ?? []).join('').replace(/[\s\xA0\u2000-\u200F]/g, '').split('');

    for (const ch of textChars) {
      const metrics = getFontMetrics(this.wrapper, ch);

      extraAscent = max(metrics.extraAscent, extraAscent);
      extraDescent = max(metrics.extraDescent, extraDescent);
    }

    const extraLineHeight = lineHeight + (extraAscent - fullAscent) + (extraDescent - descent);

    if (extraLineHeight > lineHeight) {
      this.lineHeight = ceil(extraLineHeight / lineHeight * 122) + '%';

      const em = this.emSizer.getBoundingClientRect().width;
      let baselineShift: number;

      if (extraAscent > fullAscent && extraDescent > descent)
        baselineShift = (extraAscent - fullAscent) - (extraDescent - descent);
      else if (extraAscent > fullAscent)
        baselineShift = extraAscent - fullAscent;
      else
        baselineShift = descent - extraDescent;

      this.baselineShift = (baselineShift / em / 2) + 'em';
    }
  }

  getAlignmentForItem(item: SequenceItemInfo): string {
    if (this.rtl && ((this.amPmIndex >= 0 && item.index === this.amPmIndex) ||
                     (this.eraIndex >= 0 && item.index === this.eraIndex))) {
      const displayIndex = this.displayItems.findIndex(i => item === i);

      if (displayIndex >= 0 && this.displayItems[displayIndex + 1]?.digit)
        return 'flex-end';
    }

    return super.getAlignmentForItem(item);
  }

  getClassForItem(item: SequenceItemInfo): string {
    let qlass: string;

    if (item?.name === '2occ')
      qlass = 'subscript';
    else
      qlass = super.getClassForItem(item) ?? '';

    const y = this.dateTime.wallTime.y;

    if ((this.outOfRange && item.editable) ||
        ((this.timezone as Timezone).error &&
        ((this.offsetIndex >= 0 && item.index === this.offsetIndex) ||
         (this.dstIndex >= 0 && item.index === this.dstIndex))) ||
        (this.yearIndex <= item.index && item.index < this.yearIndex + this.yearDigits && !this.yearInRange(y)))
      qlass += ' bad-value';

    return qlass?.trim() || null;
  }

  private maxYear(): number {
    const twoDigitMax = this.twoDigitYear ? this.centuryBase + 99 : Number.MAX_SAFE_INTEGER;

    return min(twoDigitMax, this.maxLimit.year);
  }

  private minYear(): number {
    const eraMin = this.eraIndex < 0 ? (this.signIndex < 0 ? 1 : Number.MIN_SAFE_INTEGER) : Number.MIN_SAFE_INTEGER;
    const twoDigitMin = this.twoDigitYear ? this.centuryBase : Number.MIN_SAFE_INTEGER;

    return max(eraMin, twoDigitMin, this.minLimit.year);
  }

  private yearInRange(y = this.dateTime.wallTime.y): boolean {
    return this.minYear() <= y && y <= this.maxYear();
  }

  private updateDigits(dateTime?: DateTime, delta = 0, selection = -1): void {
    const programmatic = (dateTime === undefined);

    dateTime = (dateTime === undefined ? this.dateTime : dateTime);

    const i = this.items as any[];
    const field = delta === 0 ? 'value' : delta < 0 ? 'swipeBelow' : 'swipeAbove';
    const alt_field = 'alt_' + field;

    if (!dateTime?.valid) {
      if (delta !== 0 && selection >= 0)
        i[selection][field] = i[selection][alt_field] = NO_BREAK_SPACE;

      return;
    }

    let wallTime = dateTime.wallTimeSparse;
    let reUpdate = false;
    let outOfRange = false;

    if (this.minLimit.compare(dateTime) > 0) {
      outOfRange = true;

      if (!programmatic) {
        wallTime = this.minLimit.getWallTime(dateTime);
        reUpdate = true;
      }
    }
    else if (this.maxLimit.compare(dateTime) < 0) {
      outOfRange = true;

      if (!programmatic) {
        wallTime = this.maxLimit.getWallTime(dateTime);
        reUpdate = true;
      }
    }

    if (delta === 0)
      this.outOfRange = outOfRange;

    if (reUpdate && delta === 0) {
      timer().subscribe(() => {
        this.errorFlash();
        dateTime.wallTime = wallTime;
        this.reportValueChange();
        this.updateDigits();
      });

      return;
    }

    let y = abs(wallTime.y);

    if (this.eraIndex >= 0)
      i[this.eraIndex][field] = this.eraStrings[wallTime.y < 1 ? 0 : 1];
    else if (this.signIndex >= 0)
      i[this.signIndex][field] = (wallTime.y < 0 ? '-' : this.signIndex > 0 ? '+' : NO_BREAK_SPACE);

    if (this.yearIndex >= 0) {
      if (this.signIndex < 0 && wallTime.y < 1)
        y = 1 - wallTime.y;

      if (this.twoDigitYear)
        y %= 100;

      this.setDigits(this.yearIndex, this.yearDigits, y, field);
    }

    this.setDigits(this.monthIndex, 2, wallTime.m, field);
    this.setDigits(this.dayIndex, 2, wallTime.d, field);

    if (this.hourIndex >= 0) {
      let h = wallTime.hrs;

      if (this.amPmIndex >= 0) {
        i[this.amPmIndex][field] = this.amPmStrings[h < 12 ? 0 : 1];
        h = (h === 0 ? 12 : h <= 12 ? h : h - 12);
      }

      this.setDigits(this.hourIndex, 2, h, field);
    }

    this.setDigits(this.minuteIndex, 2, wallTime.min, field);
    this.setDigits(this.secondIndex, 2, wallTime.sec, field);
    this.setDigits(this.millisIndex, this._options.millisDigits, wallTime.millis, field);

    if (this.occIndex >= 0)
      i[this.occIndex][field] = (dateTime.wallTime.occurrence === 2 ? OCC2 : NO_BREAK_SPACE);

    if (this.offsetIndex >= 0)
      i[this.offsetIndex][field] = dateTime.timezone.getFormattedOffset(dateTime.utcMillis);

    if (this.dstIndex >= 0) {
      if ((this.timezone as Timezone).error)
        i[this.dstIndex][field] = '?';
      else if (!dateTime.dstOffsetSeconds)
        i[this.dstIndex][field] = NO_BREAK_SPACE;
      else {
        i[this.dstIndex][field] = Timezone.getDstSymbol(dateTime.dstOffsetSeconds);
      }
    }

    this.items.forEach(item => {
      if (item.editable && isNumber(item.value)) {
        item.sizer = this.sizerDigit;

        if (this.baseDigit === '0')
          (item as any)[alt_field] = undefined;
        else
          (item as any)[alt_field] = convertDigits((item as any)[field].toString(), this.baseDigit);
      }
    });

    if (delta === 0)
      this.updateLocalTime();
  }

  private updateLocalTime(): void {
    const w = this.dateTime.wallTime;
    let year = w.y;

    if (this.isNativeDateTimeActive() && year < 1)
      year = 1;

    if (this.localTimeFormat === 'time')
      this.localTimeValue = `${padLeft(w.hrs, 2, '0')}:${padLeft(w.min, 2, '0')}`;
    else
      this.localTimeValue = `${padLeft(year, 4, '0')}-${padLeft(w.m, 2, '0')}-${padLeft(w.d, 2, '0')}` +
        (this.localTimeFormat === 'date' ? '' : `T${padLeft(w.hrs, 2, '0')}:${padLeft(w.min, 2, '0')}`);

    if (this.localTime)
      this.localTime.value = this.localTimeValue;
  }

  private getWallTimeFromDigits(): DateAndTime {
    const wt = this.dateTime.wallTime;
    const is = this.items as any as { value: string }[];
    const yi = this.yearIndex;

    let year = this.getDigits(yi, this.yearDigits, wt.y);

    if (this.twoDigitYear) {
      year = mod(year, 100);
      year = year - this.centuryBase % 100 + this.centuryBase + (year < this.centuryBase % 100 ? 100 : 0);
    }

    if (yi >= 0 && this.eraIndex >= 0 && is[this.eraIndex].value === this.eraStrings[0])
      year = 1 - year;
    else if (yi >= 0 && this.signIndex >= 0 && is[this.signIndex].value === '-')
      year *= -1;

    const month  = this.getDigits(this.monthIndex, 2, wt.m);
    const date   = this.getDigits(this.dayIndex, 2, wt.d);
    let   hour   = this.getDigits(this.hourIndex, 2, wt.hrs);
    const minute = this.getDigits(this.minuteIndex, 2, wt.min);
    const second = this.getDigits(this.secondIndex, 2, wt.sec);
    const millis = this.getDigits(this.millisIndex, this._options.millisDigits, wt.millis);

    if (this.hourIndex >= 0 && this.amPmIndex >= 0) {
      if (is[this.amPmIndex].value === this.amPmStrings[0])
        hour = (hour === 12 ? 0 : min(hour, 12));
      else if (hour !== 12)
        hour = min(hour + 12, 23);
    }

    return {
      y: year, m: month, d: date, hrs: hour, min: minute, sec: second, millis,
      occurrence: this.dateTime.wallTime.occurrence
    };
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
    const dateTime = this.dateTime.clone();
    const tai = this._tai;
    let change = 0;
    let field = DateTimeField.YEAR;
    const wallTime = this.dateTime.wallTime;
    const wasNegative = (this.items[this.signIndex]?.value === '-');
    const mDigits = this._options.millisDigits;
    const minYear = this.minYear();
    const maxYear = this.maxYear();
    const wasOutOfRange = this.outOfRange;

    if (this.eraIndex >= 0 && sel === this.eraIndex) {
      const newYear = 1 - wallTime.y;

      if (newYear < minYear || newYear > maxYear) {
        if (updateTime)
          this.errorFlash();

        return;
      }

      change = sign * (newYear - wallTime.y);
    }
    else if (this.signIndex >= 0 && sel === this.signIndex) { // Sign of year
      if (-wallTime.y < minYear || -wallTime.y > maxYear) {
        if (updateTime)
          this.errorFlash();

        return;
      }

      change = -sign * wallTime.y * 2;
    }
    else if (this.millisIndex >= 0 && this.millisIndex <= sel && sel < this.millisIndex + mDigits) {
      field = tai ? DateTimeField.MILLI_TAI : DateTimeField.MILLI;
      change = 10 ** (5 - mDigits + this.millisIndex - sel);
    }
    else if (this.secondIndex >= 0 && (sel === this.secondIndex || sel === this.secondIndex + 1)) {
      field = tai ? DateTimeField.SECOND_TAI : DateTimeField.SECOND;
      change = (sel === this.secondIndex ? 10 : 1);
    }
    else if (this.minuteIndex >= 0 && (sel === this.minuteIndex || sel === this.minuteIndex + 1)) {
      field = tai ? DateTimeField.MINUTE_TAI : DateTimeField.MINUTE;
      change = (sel === this.minuteIndex ? 10 : 1);
    }
    else if (this.hourIndex >= 0 && (sel === this.hourIndex || sel === this.hourIndex + 1)) {
      field = tai ? DateTimeField.HOUR_TAI : DateTimeField.HOUR;
      change = (sel === this.hourIndex ? 10 : 1);
    }
    else if (this.amPmIndex >= 0 && sel === this.amPmIndex) {
      field = DateTimeField.HOUR;
      change = (wallTime.hrs < 12 ? 12 : -12) * sign;
    }
    else if (this.dayIndex >= 0 && (sel === this.dayIndex || sel === this.dayIndex + 1)) {
      field = tai ? DateTimeField.DAY_TAI : DateTimeField.DAY;
      change = (sel === this.dayIndex ? 10 : 1);
    }
    else if (this.monthIndex >= 0 && (sel === this.monthIndex || sel === this.monthIndex + 1)) {
      field = DateTimeField.MONTH;
      change = (sel === this.monthIndex ? 10 : 1);
    }
    else if (this.yearIndex >= 0 && this.yearIndex <= sel && sel < this.yearIndex + this.yearDigits) {
      field = DateTimeField.YEAR;
      change = 10 ** (this.yearIndex + this.yearDigits - sel - 1);
    }

    if (updateTime)
      this.outOfRange = false;

    if (change === 0)
      return;

    dateTime.add(field, change * sign);

    if (this.minLimit.compare(dateTime) > 0 || this.maxLimit.compare(dateTime) < 0 ||
        dateTime.wallTime.y < minYear || dateTime.wallTime.y > maxYear) {
      if (updateTime)
        this.errorFlash();
      else
        this.updateDigits(null, sign, sel);

      if (!updateTime || !wasOutOfRange)
        return;
    }

    if (updateTime) {
      if (tai)
        this.dateTime.taiMillis = dateTime.taiMillis;
      else
        this.dateTime.utcMillis = dateTime.utcMillis;

      this.reportValueChange();
      this.updateDigits(this.dateTime);

      if (sel === this.signIndex && this.dateTime.wallTime.y === 0)
        this.items[sel].value = (wasNegative ? (sel > 0 ? '+' : NO_BREAK_SPACE) : '-');
    }
    else
      this.updateDigits(dateTime, sign);
  }

  protected onKey(key: string): void {
    const keyLc = key.toLocaleLowerCase(this._options.locale);
    const editable = !this.disabled && !this.viewOnly;

    if (editable &&
        ((this.selection === this.eraIndex && (key === '1' || key === '2' || this.eraKeys.includes(keyLc))) ||
         (this.selection === this.signIndex && ' -+='.includes(key)) ||
         (this.selection === this.amPmIndex && (key === '1' || key === '2' || this.amPmKeys.includes(keyLc)))))
      this.digitTyped(keyLc.charCodeAt(0), keyLc);
    else
      super.onKey(key);
  }

  protected digitTyped(charCode: number, key: string): void {
    const i = this.items;
    const origDate = this.dayIndex >= 0 ?
      (i[this.dayIndex].value as number) * 10 + (i[this.dayIndex + 1].value as number) : 0;
    const sel = this.selection;
    const origValue = i[sel].value;
    let newValue: number | string = origValue;

    if (sel === this.eraIndex) {
      const [bc, ad] = this.eraStrings;

      if (i[this.eraIndex].value === bc && (key === this.eraKeys[1] || key === '1'))
        newValue = ad;
      else if (i[this.eraIndex].value === ad && (key === this.eraKeys[0] || key === '2'))
        newValue = bc;
      else {
        if ('12'.indexOf(key) < 0 && !this.eraKeys.includes(key))
          this.errorFlash();

        return;
      }
    }
    else if (sel === this.signIndex) {
      if (i[this.signIndex].value === '-' && (key === ' ' || key === '+' || key === '='))
        newValue = sel > 0 ? '+' : NO_BREAK_SPACE;
      else if ((i[this.signIndex].value === NO_BREAK_SPACE || i[this.signIndex].value === '+') && key === '-')
        newValue = '-';
      else {
        if (' +=-'.indexOf(key) < 0)
          this.errorFlash();

        return;
      }
    }
    else if (sel === this.amPmIndex) {
      if (key === '1' || key === this.amPmKeys[0])
        newValue = this.amPmStrings[0];
      else if (key === '2' || key === this.amPmKeys[1])
        newValue = this.amPmStrings[1];
      else {
        if ('12'.indexOf(key) < 0 && !this.amPmKeys.includes(key))
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

    if (newValue !== origValue || this.outOfRange) {
      i[sel].value = newValue;

      const wallTime = this.getWallTimeFromDigits();
      let extraSec = 0;

      if (sel === this.secondIndex && newValue === 6 && this._tai) {
        const testTime = clone(wallTime);
        testTime.sec = 60;

        if (new DateTime(testTime, this.dateTime.timezone).wallTime.sec === 60)
          extraSec = 10;
      }

      if ((this.minLimit.year != null && wallTime.y < this.minLimit.year) ||
          (this.maxLimit.year != null && wallTime.y > this.maxLimit.year) ||
          wallTime.m > 19 || wallTime.d > 39 ||
          wallTime.hrs > 29 || wallTime.min > 59 || wallTime.sec > 59 + extraSec || wallTime.millis > 999) {
        i[sel].value = origValue;

        if (!this.outOfRange) {
          this.errorFlash();
          return;
        }
      }

      if (sel === this.monthIndex)
        wallTime.m = min(max(wallTime.m, 1), 12);

      if (sel === this.dayIndex)
        wallTime.d = min(max(wallTime.d, 1), 31);

      if (sel === this.hourIndex)
        wallTime.hrs = min(wallTime.hrs, 23);

      if (sel === this.secondIndex && extraSec)
        wallTime.sec = min(wallTime.sec, 60);

      if (wallTime.m === 0 || wallTime.m > 12 || wallTime.d === 0 || wallTime.hrs > 23) {
        i[sel].value = origValue;

        if (!this.outOfRange) {
          this.errorFlash();
          return;
        }
      }
      else if (!this.dateTime.isValidDate(wallTime)) {
        const lastDate = this.dateTime.getLastDateInMonth(wallTime.y, wallTime.m);
        // Check for date gaps caused by Julian-to-Gregorian transition, e.g. October 1582
        // having no 5th-14h, with 10/04 followed immediately by 10/15.
        const gap = this.dateTime.getMissingDateRange(wallTime.y, wallTime.m);

        if (gap && gap[0] <= wallTime.d && wallTime.d <= gap[1]) // Mind the gap! Step to either side of it.
          wallTime.d = (origDate > wallTime.d && gap[0] !== 1 ? gap[0] - 1 : min(gap[1] + 1, lastDate));

        if (origDate > 0 && wallTime.d > lastDate) {
          if ((lastDate < 30 && wallTime.d >= 30 && sel === this.dayIndex) ||
              (wallTime.d > lastDate && sel === this.dayIndex + 1)) {
            i[sel].value = origValue;

            if (!this.outOfRange) {
              this.errorFlash();
              return;
            }
          }

          wallTime.d = lastDate;
        }
      }

      this.dateTime.wallTime = wallTime;

      if (this.minLimit.compare(this.dateTime) > 0) {
        this.dateTime.wallTime = this.minLimit.getWallTime(this.dateTime);
        this.warningFlash();
      }
      else if (this.maxLimit.compare(this.dateTime) < 0) {
        const max = this.maxLimit.getWallTime(this.dateTime);
        const md = this._options.millisDigits;

        if (!this._options.showSeconds) {
          max.sec = 0;
          max.millis = 0;
        }
        else if (this._options.millisDigits == null || md < 3)
          max.millis = floor(max.millis / 10 ** (3 - md)) * 10 ** (3 - md);

        this.dateTime.wallTime = max;
        this.warningFlash();
      }

      this.outOfRange = false;
      this.reportValueChange();
      this.updateDigits();

      if (this.outOfRange)
        setTimeout(() => this.outOfRange = false);

      if (sel === this.signIndex && this.dateTime.wallTime.y === 0)
        this.items[sel].value = newValue;
    }

    this.cursorForward();
  }

  getValueAsText(): string {
    const opts = this._options;
    const style = opts.dateTimeStyle;
    const hasDate = style !== DateTimeStyle.TIME_ONLY;
    const hasTime = style !== DateTimeStyle.DATE_ONLY;

    if (this.outOfRange || !this.dateTime.valid)
      return 'Invalid ' + (hasDate && hasTime ? 'date/time' : hasDate ? 'date' : 'time');

    return convertDigits(this.dateTime.format(this.getFormat(), opts.locale), this.baseDigit);
  }

  private parseText(s: string): number | DateAndTime {
    s = s.replace(/[§#~?\u2744\u200F]/g, '').trim();

    let zone: string | Timezone;
    const $ = /(Z|\bTAI|\bUTC?|[+-]\d[0-9:]*)$/i.exec(s);

    if ($) {
      zone = $[1];
      s = s.slice(0, -zone.length).trim();

      if (zone === 'Z')
        zone = 'UTC';
    }

    try {
      if (!zone)
        return parseISODateTime(s, true);

      const dt = new DateTime(s, zone);

      if (dt.valid)
        return dt.taiMillis;
    }
    catch {}

    zone = zone || this.dateTime.timezone;

    const opts = this._options;
    const style = opts.dateTimeStyle;
    const hasDate = style !== DateTimeStyle.TIME_ONLY;
    const hasTime = style !== DateTimeStyle.DATE_ONLY;
    const formats = [this.getFormat().replace(/[rv\u200F]/gi, '')];

    // If parsing with a zone offset doesn't work, try without the offset.
    if (formats[0].includes('Z'))
      formats.push(formats[0].replace('Z', ''));

    if (hasDate && hasTime)
      formats.push('IMM', 'IMS', 'ISM', 'ISS');
    else if (hasDate)
      formats.push('IM', 'IS');
    else
      formats.push('IxM', 'IxS');

    for (const format of formats) {
      try {
        const dt = parse(s, format, zone, opts.locale, true);

        if (dt.valid)
          return dt.taiMillis;
      }
      catch {}
    }

    return null;
  }

  private getFormat(): string {
    let format = '';

    for (const item of this.items) {
      if (item.hidden)
        continue;

      if ((item.editable || item.indicator) && item.format)
        format += item.format;
      else if (item.static && item.value != null)
        format += item.value.toString().replace(/\u200A/g, '').replace(/([a-z])/gi, '[$1]').replace(/\xA0/g, ' ');
    }

    // Restore year/month/day order which might have been previously flipped to deal with right-to-left (RTL) markers.
    const origFormat = format;

    format = format.replace(/([yY]+)(\u200F[^a-zA-Z]+)(M+)(\u200F[^a-zA-Z]+)(D+)/, '$5$4$3$2$1');

    if (format === origFormat)
      format = format.replace(/(D+)(\u200F[^a-zA-Z]+)(M+)(\u200F[^a-zA-Z]+)([yY]+)/, '$5$4$3$2$1');

    if (format === origFormat)
      format = format.replace(/(M+)(\u200F[^a-zA-Z]+)(D+)(\u200F[^a-zA-Z]+)([yY]+)/, '$5$4$3$2$1');

    format = format.replace('rZ', 'RZ');

    return format;
  }
}
