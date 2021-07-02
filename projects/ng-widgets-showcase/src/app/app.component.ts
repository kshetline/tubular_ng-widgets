import { Component } from '@angular/core';
import { DateTime, newDateTimeFormat, Timezone } from '@tubular/time';
import { isAndroid, isIOS, isString, toBoolean, toNumber } from '@tubular/util';
import { DateTimeStyle, HourStyle, TimeEditorOptions, YearStyle } from '../../../tubular-ng-widgets/src/lib/time-editor/time-editor.component';

const DisplayNames = (Intl as any).DisplayNames;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  private _customLocale = 'en-US';
  private _customTimezone = 'America/New_York';
  private _numSystem = '';

  customCycle = '0';
  customStyle = '0';
  customYear = '';
  localeGood = true;
  mobile = isAndroid() || isIOS();
  native = false;
  numSystemGood = true;
  showSeconds = false;
  time = new DateTime().taiMillis;
  timezoneGood = true;
  yearStyle = '0';

  get customLocale(): string { return this._customLocale; }
  set customLocale(newValue: string) {
    if (this._customLocale !== newValue || !this.localeGood) {
      try {
        new Intl.DateTimeFormat(newValue);
      }
      catch {
        this.localeGood = false;
        return;
      }

      this.localeGood = true;
      this._customLocale = newValue;
    }
  }

  get customTimezone(): string { return this._customTimezone; }
  set customTimezone(newValue: string) {
    if (this._customTimezone !== newValue || !this.timezoneGood) {
      if (Timezone.has(newValue) && new DateTime(null, newValue).valid) {
        this._customTimezone = newValue;
        this.timezoneGood = true;
      }
      else
        this.timezoneGood = false;
    }
  }

  get numSystem(): string { return this._numSystem; }
  set numSystem(newValue: string) {
    if (this._numSystem !== newValue || !this.numSystemGood) {
      try {
        if (!newValue || new Intl.NumberFormat('en-u-nu-' + newValue).resolvedOptions().numberingSystem === newValue) {
          this.numSystemGood = true;
          this._numSystem = newValue;
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

      result = newDateTimeFormat(locale, fmt).format(dt.utcMillis);
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
    lang = lang || this.customLocale.toLowerCase().substr(0, 2);

    let result = '?';

    try {
      result = DisplayNames && new (DisplayNames)(lang, { type: 'language' }).of(this.customLocale);
    }
    catch {}

    if (lang !== 'en') {
      const enCaption = this.getCustomCaption('en');

      if (enCaption !== result)
        result = enCaption + ' • ' + result;
    }

    return result;
  }
}
