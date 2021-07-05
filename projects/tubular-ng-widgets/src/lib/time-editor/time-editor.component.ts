import { ChangeDetectorRef, Component, forwardRef, Input, OnInit } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DateAndTime, DateTime, DateTimeField, getISOFormatDate, isDate, newDateTimeFormat, Timezone } from '@tubular/time';
import { abs, ceil, div_tt0, floor, max, min, mod, sign } from '@tubular/math';
import { clone, convertDigits, convertDigitsToAscii, getFontMetrics, getTextWidth, isAndroid, isArray, isChrome, isEqual, isIOS, isNumber, isString, noop, padLeft, repeat, toBoolean, toNumber } from '@tubular/util';
import { timer } from 'rxjs';
import { BACKGROUND_ANIMATIONS, DigitSequenceEditorDirective, FORWARD_TAB_DELAY, SequenceItemInfo } from '../digit-sequence-editor/digit-sequence-editor.directive';

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

const TIME_EDITOR_VALUE_ACCESSOR: any = {
  provide: NG_VALUE_ACCESSOR,
  useExisting: forwardRef(() => TimeEditorComponent),
  multi: true
};

type TimeFormat = 'date' | 'time' | 'datetime-local';

function sparse(dt: DateAndTime): DateAndTime {
  const { y, m, d, hrs, min, sec, millis } = dt;

  return { y, m, d, hrs, min, sec, millis };
}

export class TimeEditorLimit {
  tai?: number;
  utc?: number;
  wallTime?: DateAndTime;
  year?: number;

  constructor(limit: Date | number | string, private asLow = false, asTai = false) {
    if (limit == null || limit === '')
      limit = asLow ? '-9999' : '9999';
    else if (isNumber(limit) && abs(limit) < 10000)
      limit = limit.toString();
    else if (isDate(limit)) {
      asTai = false;
      limit = limit.getTime();
    }
    else if (isString(limit) && /^[-+]?\d{5,}$/.test(limit.trim()))
      limit = toNumber(limit);

    if (isNumber(limit)) {
      if (asTai) {
        this.tai = limit;
        this.utc = new DateTime({ tai: limit }).utcMillis;
      }
      else {
        this.tai = new DateTime(limit).taiMillis;
        this.utc = limit;
      }

      this.year = new Date(this.utc).getFullYear();
    }
    else {
      limit = limit.trim();
      const dateTime = new DateTime(limit);

      if (!dateTime.valid)
        throw new Error(`Time limit "${limit}" not valid`);

      if (/[_a-z]$/i.test(limit)) {
        this.tai = dateTime.taiMillis;
        this.utc = dateTime.utcMillis;
        this.year = dateTime.wallTime.y;
      }
      else if (/^[\d]+$/.test(limit)) {
        this.year = dateTime.wallTime.y;
        this.wallTime = { y : this.year };
      }
      else {
        this.wallTime = sparse(dateTime.wallTime);

        if (!limit.includes(':')) {
          if (!/-[^-]+-/.test(limit))
            this.wallTime.d = undefined;
          else if (!/[\sT]\d+$/i.test(limit))
            this.wallTime.hrs = undefined;
          else
            this.wallTime.min = undefined;
        }
        else if (!limit.includes('.'))
          this.wallTime.millis = undefined;
        else if (!/:[^:]+:/.test(limit))
          this.wallTime.sec = undefined;

        this.year = this.wallTime.y;
      }

      if (!this.wallTime)
        this.wallTime = { y: this.year };
    }
  }

  compare(dateTime: DateTime): number {
    if (this.wallTime == null)
      return sign(this.tai - dateTime.taiMillis);

    const wt = dateTime.wallTime;
    const diffs = [
      this.wallTime.y - wt.y,
      this.wallTime.m - wt.m,
      this.wallTime.d - wt.d,
      this.wallTime.hrs - wt.hrs,
      this.wallTime.min - wt.min,
      this.wallTime.sec - wt.sec,
      this.wallTime.millis - wt.millis,
    ];

    for (const diff of diffs) {
      if (isNaN(diff))
        return 0;
      else if (diff !== 0)
        return sign(diff);
    }

    return 0;
  }

  getWallTime(dateTime: DateTime): DateAndTime {
    if (this.wallTime == null)
      return sparse(dateTime.isTai() ?
        new DateTime({ tai: this.tai }).wallTime :
        dateTime.clone().setUtcMillis(this.utc).wallTime);

    dateTime = new DateTime(this.wallTime, Timezone.ZONELESS);

    if (!this.asLow) {
      if (this.wallTime.m == null)
        dateTime = dateTime.endOf(DateTimeField.YEAR);
      else if (this.wallTime.d == null)
        dateTime = dateTime.endOf(DateTimeField.MONTH);
      else if (this.wallTime.hrs == null)
        dateTime = dateTime.endOf(DateTimeField.DAY);
      else if (this.wallTime.min == null)
        dateTime = dateTime.endOf(DateTimeField.HOUR);
      else if (this.wallTime.sec == null)
        dateTime = dateTime.endOf(DateTimeField.MINUTE);
      else if (this.wallTime.millis == null)
        dateTime = dateTime.endOf(DateTimeField.SECOND);
    }

    return sparse(dateTime.wallTimeShort);
  }
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
  if (typeof navigator === 'object' && navigator.language)
    defaultLocale = navigator.language;
}
catch (e) {
  defaultLocale = 'en';
}

@Component({
  selector: 'tz-time-editor',
  animations: [BACKGROUND_ANIMATIONS],
  templateUrl: '../digit-sequence-editor/digit-sequence-editor.directive.html',
  styleUrls: ['../digit-sequence-editor/digit-sequence-editor.directive.scss', './time-editor.component.scss'],
  providers: [TIME_EDITOR_VALUE_ACCESSOR]
})
export class TimeEditorComponent extends DigitSequenceEditorDirective implements ControlValueAccessor, OnInit {
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
  private onChangeCallback: (_: any) => void = noop;
  private onTouchedCallback: () => void = noop;
  private outOfRange = false;
  private _options: TimeEditorOptions = {};
  private readonly originalMinYear: number;
  private rtlMark = false;
  private sizerDigit = '0';
  private _tai = false;
  private twoDigitYear = false;

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
      this.doChangeCallback();
    }
  }

  constructor(private cd: ChangeDetectorRef) {
    super();
    this.useAlternateTouchHandling = false;
    this.originalMinYear = this.minLimit.year;
    this.explicitMinYear = false;
  }

  get value(): number { return this._tai ? this.dateTime.taiMillis : this.dateTime.utcMillis; }
  set value(newValue: number) {
    this.setValue(newValue, true);
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

          newTime = new DateTime({ y: d[0], m: d[1], d: d[2], hrs: d[3], min: d[4], sec: 0 }, this.timezone, this._gregorianChangeDate).utcMillis;
        }
        else if (($ = /(\d\d):(\d\d)/.exec(newValue))) {
          const t = $.slice(1).map(n => Number(n));

          newTime = new DateTime({ y: w.y, m: w.m, d: w.d, hrs: t[0], min: t[1], sec: 0 }, this.timezone, this._gregorianChangeDate).utcMillis;
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
    this.onTouchedCallback();
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
      format = (this.hourIndex < 0 && index < this.hourIndex ? 'date' : 'time'); // TODO: Handle time first

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
      newValue = new DateTime(newValue as any as string, this.dateTime.timezone, this.dateTime.locale, this.dateTime.getGregorianChange()).taiMillis;
    }

    if ((tai && this.dateTime.taiMillis !== newValue) || (!tai && this.dateTime.utcMillis !== newValue)) {
      if (tai)
        this.dateTime.taiMillis = newValue;
      else
        this.dateTime.utcMillis = newValue;

      this.updateDigits();

      if (doCallback)
        this.doChangeCallback();
    }
  }

  private doChangeCallback(): void {
    this.onChangeCallback(this._tai ? this.dateTime.taiMillis : this.dateTime.utcMillis);
  }

  registerOnChange(fn: any): void {
    this.onChangeCallback = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouchedCallback = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.displayState = (isDisabled ? 'disabled' : (this.viewOnly ? 'viewOnly' : 'normal'));
  }

  get wallTime(): DateAndTime { return this.dateTime.wallTime; }

  get min(): Date | number | string { return this._min; }
  @Input() set min(value: Date | number | string) {
    if (this._min !== value) {
      this._min = value;
      this.minLimit = new TimeEditorLimit(value, true, this.tai as boolean);

      if (this.minLimit.wallTime == null && value != null && value !== '') {
        this.explicitMinYear = true;
        this.centuryBase = this.minLimit.year;
      }
      else
        this.explicitMinYear = false;

      this.adjustLocalTimeMin();
      setTimeout(() => this.updateDigits());
    }
  }

  get max(): Date | number | string { return this._max; }
  @Input() set max(value: Date | number | string) {
    if (this._max !== value) {
      this._max = value;
      this.maxLimit = new TimeEditorLimit(value, false, this.tai as boolean);
      this.outOfRange = false;
      this.adjustLocalTimeMax();
      setTimeout(() => this.updateDigits());
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
          this.doChangeCallback();
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
      this.rtl = this.rtl || RTL_CHECK.test(sampleDate);
      this.rtlMark = this.rtl && sampleDate.includes('\u200F');
      ds = opts.dateFieldSeparator ||
        convertDigitsToAscii(sampleDate, baseDigit).replace(/(^\D+)|[\d\s\u2000-\u200F]/g, '').charAt(0) || '/';

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

    const addDigits = (n: number): void => repeat(n, () => this.items.push({ value: 0, digit: true, editable: true }));

    for (const step of steps) {
      const i = this.items.length;

      switch (step) {
        case 'year': this.yearIndex = i; addDigits(4); break;
        case 'era':
          this.items.push({ value: es, static: true, width: '0.25em' });
          this.eraIndex = i + 1;
          this.items.push({ value: this.eraStrings[1], editable: true, sizer: this.eraStrings.join('\n') });
          break;
        case 'sign':
          this.signIndex = i;
          this.items.push({ value: NO_BREAK_SPACE, editable: true, monospaced: true, sign: true, sizer: '-' });
          break;
        case 'ds': this.items.push({ value: ds, bidi: true, static: true }); break;
        case 'month': this.monthIndex = i; addDigits(2); break;
        case 'day': this.dayIndex = i; addDigits(2); break;
        case 'dts': this.items.push({ value: dts, static: true,
                                      opacity: dts === ISO_T ? 0.15 : 1,
                                      width: dts === NO_BREAK_SPACE ?  '0.6em' : undefined }); break;
        case 'hour': this.hourIndex = i; addDigits(2); break;
        case 'aps': this.items.push({ value: NO_BREAK_SPACE, static: true, width: '0.25em' }); break;
        case 'amPm':
          this.amPmIndex = i;
          this.items.push({ value: this.amPmStrings[0], editable: true, sizer: this.amPmStrings.join('\n') });
          break;
        case 'ts': this.items.push({ value: ts, bidi: true, static: true }); break;
        case 'minute': this.minuteIndex = i; addDigits(2); break;
        case 'second': this.secondIndex = i; addDigits(2); break;
        case 'millis':
          this.items.push({ value: decimal, static: true });
          this.millisIndex = i + 1;
          addDigits(min(opts.millisDigits, 3)); break;
        case 'occ':
          this.occIndex = i;
          this.items.push({ value: NO_BREAK_SPACE, sizer: OCC2, name: '2occ' });
          break;
        case 'off':
          this.offsetIndex = i;
          this.items.push({ value: '+00:00', indicator: true, monospaced: true });
          break;
        case 'dst':
          this.dstIndex = i;
          this.items.push({ value: NO_BREAK_SPACE, indicator: true, sizer: '^\n§\n#\n~\n?\n\u2744' });
          break;
      }
    }

    if (this.twoDigitYear && this.yearIndex >= 0) {
      this.items[this.yearIndex].hidden = this.items[this.yearIndex + 1].hidden = true;

      if (!this.explicitMinYear)
        this.centuryBase = DateTime.getDefaultCenturyBase();
      else
        this.centuryBase = this.minLimit.year;
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
    const base = this.centuryBase;

    if ((this.outOfRange && item.editable) ||
        ((this.timezone as Timezone).error &&
        ((this.offsetIndex >= 0 && item.index === this.offsetIndex) ||
         (this.dstIndex >= 0 && item.index === this.dstIndex))) ||
        (this.yearIndex >= 0 && this.signIndex < 0 && this.eraIndex < 0 &&
             this.yearIndex <= item.index && item.index < this.yearIndex + 4 &&
             (y < 1 || (this.twoDigitYear && (y < base || y > base + 99))))) {
      qlass += ' bad-value';
    }

    return qlass?.trim() || null;
  }

  private updateDigits(dateTime?: DateTime, delta = 0, selection = -1): void {
    const programmatic = (dateTime === undefined);

    dateTime = dateTime === undefined ? this.dateTime : dateTime;

    const i = this.items as any[];
    const value = delta === 0 ? 'value' : delta < 0 ? 'swipeBelow' : 'swipeAbove';
    const alt_value = 'alt_' + value;
    let j: number;

    if (!dateTime?.valid) {
      if (delta !== 0 && selection >= 0)
        i[selection][value] = i[selection][alt_value] = NO_BREAK_SPACE;

      return;
    }

    let wallTime = sparse(dateTime.wallTime);
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
        this.doChangeCallback();
        this.updateDigits();
      });

      return;
    }

    let y = abs(wallTime.y);

    if (this.eraIndex >= 0)
      i[this.eraIndex][value] = this.eraStrings[wallTime.y < 1 ? 0 : 1];
    else if (this.signIndex >= 0)
      i[this.signIndex][value] = (wallTime.y < 0 ? '-' : this.signIndex > 0 ? '+' : NO_BREAK_SPACE);

    if (this.yearIndex >= 0) {
      if (this.signIndex < 0 && wallTime.y < 1)
        y = 1 - wallTime.y;

      // noinspection JSSuspiciousNameCombination
      const y4 = div_tt0(y, 1000);
      const y3 = div_tt0(y - y4 * 1000, 100);
      const y2 = div_tt0(y - y4 * 1000 - y3 * 100, 10);
      const y1 = y % 10;

      j = this.yearIndex;
      [i[j][value], i[j + 1][value], i[j + 2][value], i[j + 3][value]] = [y4, y3, y2, y1];
    }

    if (this.monthIndex >= 0) {
      const M2 = div_tt0(wallTime.m, 10);
      const M1 = wallTime.m % 10;

      j = this.monthIndex;
      [i[j][value], i[j + 1][value]] = [M2, M1];
    }

    if (this.dayIndex >= 0) {
      const d2 = div_tt0(wallTime.d, 10);
      const d1 = wallTime.d % 10;

      j = this.dayIndex;
      [i[j][value], i[j + 1][value]] = [d2, d1];
    }

    if (this.hourIndex >= 0) {
      let h = wallTime.hrs;

      if (this.amPmIndex >= 0) {
        i[this.amPmIndex][value] = this.amPmStrings[h < 12 ? 0 : 1];
        h = (h === 0 ? 12 : h <= 12 ? h : h - 12);
      }

      const h2 = div_tt0(h, 10);
      const h1 = h % 10;

      j = this.hourIndex;
      [i[j][value], i[j + 1][value]] = [h2, h1];
    }

    if (this.minuteIndex >= 0) {
      const m2 = div_tt0(wallTime.min, 10);
      const m1 = wallTime.min % 10;

      j = this.minuteIndex;
      [i[j][value], i[j + 1][value]] = [m2, m1];
    }

    if (this.secondIndex >= 0) {
      const s2 = div_tt0(wallTime.sec, 10);
      const s1 = wallTime.sec % 10;

      j = this.secondIndex;
      [i[j][value], i[j + 1][value]] = [s2, s1];
    }

    if (this.millisIndex >= 0) {
      const digits = this._options.millisDigits;
      let ms = floor(wallTime.millis / 10 ** (digits - 3));

      for (j = this.millisIndex + digits - 1; j >= this.millisIndex; --j) {
        i[j][value] = ms % 10;
        ms = floor(ms / 10);
      }
    }

    if (this.occIndex >= 0)
      i[this.occIndex][value] = (wallTime.occurrence === 2 ? OCC2 : NO_BREAK_SPACE);

    if (this.offsetIndex >= 0)
      i[this.offsetIndex][value] = dateTime.timezone.getFormattedOffset(dateTime.utcMillis);

    if (this.dstIndex >= 0) {
      if ((this.timezone as Timezone).error)
        i[this.dstIndex][value] = '?';
      else if (!wallTime.dstOffset)
        i[this.dstIndex][value] = NO_BREAK_SPACE;
      else {
        i[this.dstIndex][value] = Timezone.getDstSymbol(wallTime.dstOffset);
      }
    }

    this.items.forEach(item => {
      if (item.editable && isNumber(item.value)) {
        item.sizer = this.sizerDigit;

        if (this.baseDigit === '0')
          (item as any)[alt_value] = undefined;
        else
          (item as any)[alt_value] = convertDigits((item as any)[value].toString(), this.baseDigit);
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
    const i = this.items as any as { value: number }[];
    const is = this.items as any as { value: string }[];
    const yi = this.yearIndex;
    const Mi = this.monthIndex;
    const di = this.dayIndex;
    const hi = this.hourIndex;
    const mi = this.minuteIndex;
    const si = this.secondIndex;
    const msi = this.millisIndex;

    let year = yi >= 0 ?  i[yi].value * 1000 + i[yi + 1].value * 100 + i[yi + 2].value * 10 + i[yi + 3].value : wt.y;

    if (this.twoDigitYear) {
      year = mod(year, 100);
      year = year - this.centuryBase % 100 + this.centuryBase + (year < this.centuryBase % 100 ? 100 : 0);
    }

    if (yi >= 0 && this.eraIndex >= 0 && is[this.eraIndex].value === this.eraStrings[0])
      year = 1 - year;
    else if (yi >= 0 && this.signIndex >= 0 && is[this.signIndex].value === '-')
      year *= -1;

    const month  = Mi >= 0 ? i[Mi].value * 10 + i[Mi + 1].value : wt.m;
    const date   = di >= 0 ? i[di].value * 10 + i[di + 1].value : wt.d;
    let   hour   = hi >= 0 ? i[hi].value * 10 + i[hi + 1].value : wt.hrs;
    const minute = mi >= 0 ? i[mi].value * 10 + i[mi + 1].value : wt.min;
    const second = si >= 0 ? i[si].value * 10 + i[si + 1].value : wt.sec;
    let   millis = wt.millis;

    if (msi >= 0) {
      millis = 0;

      for (let j = msi; j < msi + this._options.millisDigits; ++j) {
        millis *= 10;
        millis += i[j].value;
      }

      millis *= 10 ** (3 - this._options.millisDigits);
    }

    if (hi >= 0 && this.amPmIndex >= 0) {
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
    const yearStyle = isArray(this._options.yearStyle) ? YearStyle.AD_BC : this._options.yearStyle;
    const minYear = max(this.minLimit.year, this.explicitMinYear ? this.centuryBase : [1, -9999, -9999][yearStyle]);
    const maxYear = min(this.maxLimit.year, this.explicitMinYear ? this.centuryBase + 99 : 9999);
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
    else if (this.yearIndex >= 0 && this.yearIndex <= sel && sel < this.yearIndex + 4) {
      field = DateTimeField.YEAR;
      change = 10 ** (3 + this.yearIndex - sel);
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

      this.doChangeCallback();
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
    const origDate = this.dayIndex >= 0 ? <number> i[this.dayIndex].value * 10 + <number> i[this.dayIndex + 1].value : 0;
    const sel = this.selection;
    const origValue = i[sel].value;
    let newValue: number | string = origValue;

    if (sel === this.eraIndex) {
      const [bc, ad] = this.eraStrings;

      if (i[this.eraIndex].value === bc && (key === this.eraKeys[1] || key === '1'))
        newValue = ad;
      else if (i[this.eraIndex].value === ad && (key === this.eraKeys[0] || key === '2'))
        newValue = bc;
    }
    else if (sel === this.signIndex) {
      if (' +=-'.indexOf(key) < 0) {
        this.errorFlash();
        return;
      }
      else if (i[this.signIndex].value === '-' && (key === ' ' || key === '+' || key === '='))
        newValue = sel > 0 ? '+' : NO_BREAK_SPACE;
      else if ((i[this.signIndex].value === NO_BREAK_SPACE || i[this.signIndex].value === '+') && key === '-')
        newValue = '-';
    }
    else if (sel === this.amPmIndex) {
      if (key === '1' || key === this.amPmKeys[0])
        newValue = this.amPmStrings[0];
      else if (key === '2' || key === this.amPmKeys[1])
        newValue = this.amPmStrings[1];
      else {
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
      this.doChangeCallback();
      this.updateDigits();

      if (this.outOfRange)
        setTimeout(() => this.outOfRange = false);

      if (sel === this.signIndex && this.dateTime.wallTime.y === 0)
        this.items[sel].value = newValue;
    }

    this.cursorForward();
  }
}
