import { Component } from '@angular/core';
import { DateTime, newDateTimeFormat, Timezone } from '@tubular/time';
import { isAndroid, isIOS, isString, toBoolean, toNumber } from '@tubular/util';
import { DateTimeStyle, HourStyle, TimeEditorOptions, YearStyle }
  from '../../../tubular-ng-widgets/src/lib/time-editor/time-editor.component';
import { TimeEditorLimit } from '../../../tubular-ng-widgets/src/lib/time-editor/time-editor-limit';
import { AngleStyle } from '../../../tubular-ng-widgets/src/lib/angle-editor/angle-editor.component';
import { Point } from '@tubular/math';

const intl_DisplayNames = (Intl as any).DisplayNames;
const mobile = isAndroid() || isIOS();
const defaultSettings = {
  customCycle: '0',
  customStyle:'0',
  customYear: 'false',
  darkMode: true,
  float: false,
  floatPosition: null as Point,
  native: false,
  showSeconds: false,
  timeDisabled: false,
  viewOnly: true,
  yearStyle: '0'
};

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  AD_BC = YearStyle.AD_BC;
  AM_PM = HourStyle.AM_PM;
  DD = AngleStyle.DD;
  DD_MM = AngleStyle.DD_MM;
  mobile = mobile;
  POSITIVE_ONLY = YearStyle.POSITIVE_ONLY;
  SIGNED = YearStyle.SIGNED;
  TIME_ONLY = DateTimeStyle.TIME_ONLY;

  private _customLocale = navigator.language;
  private _customTimezone = 'America/New_York';
  private _max = '';
  private _min = '';
  private _numSystem = '';
  private updateTimer: any;

  angle = 0;
  customCycle = '0';
  customStyle = '0';
  customYear = 'false';
  darkMode = true;
  float = false;
  floatPosition: Point = null;
  localeGood = true;
  maxGood = true;
  minGood = true;
  minMaxAngle = 5;
  native = false;
  numSystemGood = true;
  showSeconds = false;
  time = new DateTime().taiMillis;
  timeDisabled = false;
  timezoneGood = true;
  viewOnly = true;
  yearStyle = '0';

  constructor() {
    let settings: any;

    try {
      settings = JSON.parse(localStorage.getItem('tbw-settings') ?? 'null');
    }
    catch {}

    settings = settings ?? defaultSettings;
    this.updateTimer = null;
    Object.keys(defaultSettings).forEach(key => (this as any)[key] = settings[key]);
    this.updateTimer = undefined;
    window.addEventListener('beforeunload', () => {
      if (this.updateTimer)
        clearTimeout(this.updateTimer);

      this.saveSettings();
    });

    setTimeout(() => this.minMaxAngle = 4, 3000);
  }

  private saveSettings(): void {
    const settings: any = {};

    Object.keys(defaultSettings).forEach(key => settings[key] = (this as any)[key]);
    localStorage.setItem('tbw-settings', JSON.stringify(settings));
  }

  settingsUpdated(): boolean {
    if (this.updateTimer === undefined) {
      this.updateTimer = setTimeout(() => {
        this.saveSettings();
        this.updateTimer = undefined;
      }, 1000);
    }

    return true;
  }

  setFloat(state: boolean): void {
    this.float = state;

    if (state && !this.floatPosition) {
      const utcEditor = document.querySelector('#utc-editor');

      if (utcEditor) {
        const r = utcEditor.getBoundingClientRect();

        this.floatPosition = { x: r.x, y: r.y };
      }
      else
        this.floatPosition = { x: 0, y: 0 };
    }
    else if (!state)
      this.floatPosition = null;

    this.settingsUpdated();
  }

  get customLocale(): string { return this._customLocale; }
  set customLocale(newValue: string) {
    if (this._customLocale !== newValue || !this.localeGood) {
      try {
        if (newValue) new Intl.DateTimeFormat(newValue);
      }
      catch {
        this.localeGood = false;
        return;
      }

      this.localeGood = true;
      this._customLocale = newValue;
      this.settingsUpdated();
    }
  }

  get customTimezone(): string { return this._customTimezone; }
  set customTimezone(newValue: string) {
    if (this._customTimezone !== newValue || !this.timezoneGood) {
      if (Timezone.has(newValue) && new DateTime(null, newValue).valid) {
        this._customTimezone = newValue;
        this.timezoneGood = true;
        this.settingsUpdated();
      }
      else
        this.timezoneGood = false;
    }
  }

  get max(): string { return this._max; }
  set max(newValue: string) {
    if (this._max !== newValue || !this.maxGood) {
      try {
        new TimeEditorLimit(newValue);
      }
      catch {
        this.maxGood = false;
        return;
      }

      this._max = newValue;
      this.maxGood = true;
      this.settingsUpdated();
    }
  }

  get min(): string { return this._min; }
  set min(newValue: string) {
    if (this._min !== newValue || !this.minGood) {
      try {
        new TimeEditorLimit(newValue);
      }
      catch {
        this.minGood = false;
        return;
      }

      this._min = newValue;
      this.minGood = true;
      this.settingsUpdated();
    }
  }

  get numSystem(): string { return this._numSystem; }
  set numSystem(newValue: string) {
    if (this._numSystem !== newValue || !this.numSystemGood) {
      try {
        if (!newValue || new Intl.NumberFormat('en-u-nu-' + newValue).resolvedOptions().numberingSystem === newValue) {
          this.numSystemGood = true;
          this._numSystem = newValue;
          this.settingsUpdated();
          return;
        }
      }
      catch {}

      this.numSystemGood = false;
      return;
    }
  }

  setCurrentTime(): void {
    this.time = new DateTime().taiMillis;
  }

  format(zone: string = null, locale: string = null, fmt: string | Intl.DateTimeFormatOptions): string {
    const dt = new DateTime({ tai: this.time }, zone, locale);
    let result: string;

    if (isString(fmt))
      result = dt.format(fmt);
    else {
      if (zone)
        fmt.timeZone = zone;

      result = newDateTimeFormat(locale, fmt).format(dt.epochMillis);
    }

    return result;
  }

  getOptions(): TimeEditorOptions {
    return {
      dateTimeStyle: toNumber(this.customStyle),
      hourStyle: toNumber(this.customCycle),
      locale: this.customLocale,
      numbering: this.numSystem || undefined,
      showSeconds: this.showSeconds,
      twoDigitYear: this.customYear ? toBoolean(this.customYear) : undefined,
      yearStyle: toNumber(this.yearStyle)
    };
  }

  getFormat(): string {
    const styleNum = toNumber(this.customStyle);
    const style = styleNum ? (styleNum === DateTimeStyle.DATE_ONLY ? 'S' : 'xS') : 'SS';
    const era = toNumber(this.yearStyle) === YearStyle.AD_BC ? ',era:short' : '';
    const year = this.customYear && styleNum !== DateTimeStyle.TIME_ONLY ?
      ',year:' + (toBoolean(this.customYear) ? '2-digit' : 'numeric') : '';
    const monthDay = styleNum !== DateTimeStyle.TIME_ONLY ? ',month:2-digit,day:2-digit' : '';
    const cycle = toNumber(this.customCycle);
    const hour =  styleNum !== DateTimeStyle.DATE_ONLY ? ',hour:2-digit' : '';
    const hourCycle = cycle && styleNum !== DateTimeStyle.DATE_ONLY ?
      ',hourCycle:' + (cycle === HourStyle.HOURS_24 ? 'h23' : 'h12') : '';
    const seconds = this.showSeconds && styleNum !== DateTimeStyle.DATE_ONLY ? ',second:2-digit' : '';
    const numbering = this.numSystem && ',numberingSystem:' + this.numSystem;

    return `I${style}{${era}${year}${monthDay}${hour}${hourCycle}${seconds}${numbering}}`
      .replace('{,' , '{').replace('{},' , '');
  }

  getCustomCaption(lang?: string): string {
    lang = lang || this.customLocale.toLowerCase().substr(0, 2) || navigator.language;

    let result = '?';

    try {
      result = intl_DisplayNames &&
        new (intl_DisplayNames)(lang, { type: 'language' }).of(this.customLocale || navigator.language);
    }
    catch {}

    if (lang !== 'en') {
      const enCaption = this.getCustomCaption('en');

      if (enCaption !== result)
        result = enCaption + ' • ' + result;
    }

    return result;
  }

  inputBackground(good: boolean): string {
    return good ? 'inherit' : this.darkMode ? '#803' : '#FBC';
  }
}
