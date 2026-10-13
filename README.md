# FERIT raspored

A schedule app for FERIT students. Choose your study programme, year and LV group for each subject. The app remembers your choices on your phone and opens today’s schedule automatically.

## Install on Android

[Download FERIT-raspored.apk — version 1.0.5](https://github.com/KTihana/FERIT-raspored/releases/download/v1.0.5-android-test/FERIT-raspored.apk)

1. Open the download link on your Android phone, or select **FERIT-raspored.apk** under Assets on [the release page](https://github.com/KTihana/FERIT-raspored/releases/tag/v1.0.5-android-test). No GitHub sign-in is required.
2. Open the downloaded file and install it. If Android asks, allow installation from the browser you used to download it. You can install this update over a previous version without deleting your saved choices or personal changes.
3. Choose your study programme, select the original FERIT year/module label, and confirm with **Prikaži raspored**. Then choose your LV groups for each subject. Your choices and personal schedule changes are saved on your phone.

The app runs locally on your phone. Internet is needed to fetch schedule updates directly from FERIT.

## FERIT Grid design

The interface follows FERIT Grid: compact navigation, flat controls and thin dividers. Timetable blocks use stronger Signal peach, green, blue and purple, with larger subject titles and bold room and group labels. The date picker is compact and today is highlighted.

## Personal events and week view

Added events show a bold room / location beside the time, including short one-hour events. Choose purple (the default), peach, green or blue in the event editor. The app saves both the colour and location on your phone.

The week view automatically turns sideways with all seven days visible. Hours scroll vertically at a readable fixed scale, preserving real class durations and gaps. Weekday headings remain visible while you scroll.

## Themes and editing

Locations are bold, and the compact header leaves more space for the timetable. Choose **Svijetla** or **Tamna** in **Postavke**; the app saves your theme on the device. Hold a class to edit it. Ordinary taps do not open the editor, and scrolling or swiping cancels a hold. The editor uses **Osobna izmjena** and the requested note examples. The app icon is FERIT’s geometric emblem without its wordmark.

## Accurate study selection

Version 1.0.5 displays FERIT’s complete official study names and original timetable labels together, matching the website’s grouping. Stručni studij Računarstvo and Stručni studij Računarstvo - Vinkovci remain separate; the Croatian and English automotive programmes remain separate too. All 62 currently visible choices and their exact routes were checked against [FERIT’s timetable page](https://www.ferit.unios.hr/studenti/raspored-nastave-i-ispita) on 13 October 2026. The app rejects a different schedule or week returned by FERIT.

This is a signed Android test build for Android 7.0 or newer. All 22 automated tests and APK signature verification pass. Real-phone testing is pending.

## Source project

[Download the complete Android/iPhone source ZIP](https://github.com/KTihana/FERIT-raspored/releases/download/v1.0.5-android-test/FERIT-raspored-source.zip). Extract it on your computer and follow its README to build or edit the app. The ZIP also includes the catalogue verification record.

The iPhone project still needs an Xcode build and Apple signing.

