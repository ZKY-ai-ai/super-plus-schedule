package io.github.lcymxm.classflow;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import android.text.TextUtils;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Writes timetable occurrences into the device calendar through CalendarContract.
 * Every inserted event carries a stable key marker in its description, so a
 * repeated sync can skip occurrences that were already written.
 */
@CapacitorPlugin(
    name = "SystemCalendar",
    permissions = {
        @Permission(
            alias = "calendar",
            strings = { Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR }
        )
    }
)
public class SystemCalendarPlugin extends Plugin {

    private static final String PERMISSION_ALIAS = "calendar";
    private static final int WRITABLE_ACCESS = CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL_CONTRIBUTOR;
    private static final Pattern KEY_PATTERN = Pattern.compile("\\[KEXU:([^\\]]+)\\]");

    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (getPermissionState(PERMISSION_ALIAS) != PermissionState.GRANTED) {
            call.reject("需要日历读取权限才能列出系统日历。", "PERMISSION_DENIED");
            return;
        }

        ContentResolver resolver = getContext().getContentResolver();
        String[] projection = {
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.ACCOUNT_NAME,
            CalendarContract.Calendars.CALENDAR_COLOR,
            CalendarContract.Calendars.IS_PRIMARY,
            CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL
        };
        String selection = CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + ">=?";
        String[] args = { String.valueOf(WRITABLE_ACCESS) };
        String order =
            CalendarContract.Calendars.IS_PRIMARY
                + " DESC, "
                + CalendarContract.Calendars.CALENDAR_DISPLAY_NAME
                + " ASC";

        JSArray calendars = new JSArray();
        try (Cursor cursor = resolver.query(
            CalendarContract.Calendars.CONTENT_URI,
            projection,
            selection,
            args,
            order
        )) {
            if (cursor == null) {
                call.reject("无法读取系统日历列表。", "QUERY_FAILED");
                return;
            }
            while (cursor.moveToNext()) {
                JSObject item = new JSObject();
                item.put("id", String.valueOf(cursor.getLong(0)));
                String name = cursor.getString(1);
                item.put("name", TextUtils.isEmpty(name) ? "未命名日历" : name);
                String account = cursor.getString(2);
                item.put("account", account == null ? "" : account);
                item.put(
                    "color",
                    String.format(Locale.US, "#%06X", 0xFFFFFF & cursor.getInt(3))
                );
                item.put("isPrimary", cursor.getInt(4) == 1);
                item.put("access", cursor.getInt(5));
                calendars.put(item);
            }
        } catch (Exception error) {
            call.reject("读取系统日历失败：" + error.getMessage(), "QUERY_FAILED");
            return;
        }

        JSObject result = new JSObject();
        result.put("calendars", calendars);
        call.resolve(result);
    }

    @PluginMethod
    public void sync(PluginCall call) {
        if (getPermissionState(PERMISSION_ALIAS) != PermissionState.GRANTED) {
            call.reject("需要日历读写权限才能同步课表。", "PERMISSION_DENIED");
            return;
        }

        String calendarId = call.getString("calendarId");
        String eventsPayload = call.getString("events");
        if (TextUtils.isEmpty(calendarId) || TextUtils.isEmpty(eventsPayload)) {
            call.reject("缺少日历 ID 或课程事件。", "INVALID_ARGUMENT");
            return;
        }
        org.json.JSONArray events;
        try {
            events = new org.json.JSONArray(eventsPayload);
        } catch (Exception error) {
            call.reject("课程事件格式不正确。", "INVALID_ARGUMENT");
            return;
        }
        if (!isWritableCalendar(calendarId)) {
            call.reject("所选日历不可写入，请换一个日历。", "CALENDAR_NOT_WRITABLE");
            return;
        }

        long minStart = Long.MAX_VALUE;
        long maxEnd = Long.MIN_VALUE;
        for (int index = 0; index < events.length(); index += 1) {
            JSONObject item = events.optJSONObject(index);
            if (item == null) continue;
            long start = item.optLong("startMs", 0);
            long end = item.optLong("endMs", 0);
            if (start <= 0 || end <= start) continue;
            minStart = Math.min(minStart, start);
            maxEnd = Math.max(maxEnd, end);
        }

        Set<String> existingKeys = new HashSet<>();
        if (minStart < maxEnd) {
            existingKeys = loadExistingKeys(calendarId, minStart, maxEnd);
            if (existingKeys == null) {
                call.reject("无法读取该日历里已有的课表日程，请稍后再试。", "QUERY_FAILED");
                return;
            }
        }

        ContentResolver resolver = getContext().getContentResolver();
        String timeZone = TimeZone.getDefault().getID();
        int inserted = 0;
        int skipped = 0;
        int failed = 0;
        int total = 0;

        for (int index = 0; index < events.length(); index += 1) {
            JSONObject item = events.optJSONObject(index);
            if (item == null) continue;
            long start = item.optLong("startMs", 0);
            long end = item.optLong("endMs", 0);
            if (start <= 0 || end <= start) continue;
            total += 1;

            String key = item.optString("key", "");
            if (!TextUtils.isEmpty(key) && existingKeys.contains(key)) {
                skipped += 1;
                continue;
            }

            boolean allDay = item.optBoolean("allDay", false);
            ContentValues values = new ContentValues();
            values.put(CalendarContract.Events.CALENDAR_ID, Long.parseLong(calendarId));
            values.put(
                CalendarContract.Events.DTSTART,
                allDay ? utcMidnight(start) : start
            );
            values.put(
                CalendarContract.Events.DTEND,
                allDay ? utcMidnight(end) : end
            );
            values.put(CalendarContract.Events.ALL_DAY, allDay ? 1 : 0);
            values.put(
                CalendarContract.Events.EVENT_TIMEZONE,
                allDay ? "UTC" : timeZone
            );
            values.put(
                CalendarContract.Events.TITLE,
                item.optString("title", "课程")
            );
            values.put(
                CalendarContract.Events.DESCRIPTION,
                item.optString("description", "")
            );
            values.put(
                CalendarContract.Events.EVENT_LOCATION,
                item.optString("location", "")
            );
            values.put(CalendarContract.Events.HAS_ALARM, 0);
            values.put(
                CalendarContract.Events.STATUS,
                CalendarContract.Events.STATUS_CONFIRMED
            );

            try {
                Uri insertedUri = resolver.insert(
                    CalendarContract.Events.CONTENT_URI,
                    values
                );
                if (insertedUri == null) {
                    failed += 1;
                } else {
                    inserted += 1;
                    if (!TextUtils.isEmpty(key)) existingKeys.add(key);
                }
            } catch (Exception error) {
                failed += 1;
            }
        }

        JSObject result = new JSObject();
        result.put("inserted", inserted);
        result.put("skipped", skipped);
        result.put("failed", failed);
        result.put("total", total);
        call.resolve(result);
    }

    /** Returns null when the query itself failed, so sync can stop instead of duplicating. */
    private Set<String> loadExistingKeys(String calendarId, long minStart, long maxEnd) {
        Set<String> keys = new HashSet<>();
        String[] projection = { CalendarContract.Events.DESCRIPTION };
        String selection =
            CalendarContract.Events.CALENDAR_ID
                + "=? AND "
                + CalendarContract.Events.DELETED
                + "=0 AND "
                + CalendarContract.Events.DTSTART
                + "<? AND "
                + CalendarContract.Events.DTEND
                + ">?";
        String[] args = {
            calendarId,
            String.valueOf(maxEnd),
            String.valueOf(minStart)
        };
        try (Cursor cursor = getContext().getContentResolver().query(
            CalendarContract.Events.CONTENT_URI,
            projection,
            selection,
            args,
            null
        )) {
            while (cursor != null && cursor.moveToNext()) {
                String description = cursor.getString(0);
                if (TextUtils.isEmpty(description)) continue;
                Matcher matcher = KEY_PATTERN.matcher(description);
                if (matcher.find()) keys.add(matcher.group(1));
            }
        } catch (Exception error) {
            return null;
        }
        return keys;
    }

    private boolean isWritableCalendar(String calendarId) {
        long id;
        try {
            id = Long.parseLong(calendarId);
        } catch (NumberFormatException error) {
            return false;
        }
        String[] projection = { CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL };
        try (Cursor cursor = getContext().getContentResolver().query(
            ContentUris.withAppendedId(CalendarContract.Calendars.CONTENT_URI, id),
            projection,
            null,
            null,
            null
        )) {
            return cursor != null
                && cursor.moveToFirst()
                && cursor.getInt(0) >= WRITABLE_ACCESS;
        } catch (Exception error) {
            return false;
        }
    }

    /** All-day events use UTC midnight, as CalendarContract expects. */
    private long utcMidnight(long localMillis) {
        Calendar local = Calendar.getInstance();
        local.setTimeInMillis(localMillis);
        Calendar utc = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        utc.clear();
        utc.set(
            local.get(Calendar.YEAR),
            local.get(Calendar.MONTH),
            local.get(Calendar.DAY_OF_MONTH),
            0,
            0,
            0
        );
        return utc.getTimeInMillis();
    }
}
