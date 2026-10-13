# FERIT raspored

A schedule app for FERIT students. Choose your study programme, year and LV group for each subject. The app remembers your choices on your phone and opens today’s schedule automatically.

## Install on Android

[Download FERIT-raspored.apk — version 1.0.1](https://github.com/KTihana/FERIT-raspored/releases/download/v1.0.1-android-test/FERIT-raspored.apk)

1. Open the download link on your Android phone, or select **FERIT-raspored.apk** under Assets on [the release page](https://github.com/KTihana/FERIT-raspored/releases/tag/v1.0.1-android-test). No GitHub sign-in is required.
2. Open the downloaded file and install it. If Android asks, allow installation from the browser you used to download it. You can install this update over version 1.0 without deleting your saved choices or personal changes.
3. Choose your study programme and the original FERIT year/module label beneath it. Then choose your LV groups for each subject. Your choices and personal schedule changes are saved on your phone.

The app runs locally on your phone. Internet is needed to fetch schedule updates directly from FERIT.

## Accurate study selection

Version 1.0.1 displays FERIT’s complete official study names and original timetable labels together, matching the website’s grouping. Stručni studij Računarstvo and Stručni studij Računarstvo - Vinkovci remain separate; the Croatian and English automotive programmes remain separate too. All 62 currently visible choices and their exact routes were checked against [FERIT’s timetable page](https://www.ferit.unios.hr/studenti/raspored-nastave-i-ispita) on 13 October 2026. The app rejects a different schedule or week returned by FERIT.

This is a signed Android test build for Android 7.0 or newer. All 14 automated tests and APK signature verification pass. Real-phone testing is pending.

## Source project

[Download the complete Android/iPhone source ZIP](https://github.com/KTihana/FERIT-raspored/releases/download/v1.0.1-android-test/FERIT-raspored-source.zip). Extract it on your computer and follow its README to build or edit the app. The ZIP also includes the catalogue verification record.

The iPhone project still needs an Xcode build and Apple signing.
