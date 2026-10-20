package app.mojraspored.ferit.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;

/** Native-rendered in-class example, scaled to fit the launcher without stretching. */
public final class WidgetPreview {
    public static RemoteViews views(Context context) {
        return new RemoteViews(context.getPackageName(),app.mojraspored.ferit.R.layout.widget_pin_preview);
    }
    public static Bundle pinExtras(Context context) {
        Bundle extras=new Bundle();
        extras.putParcelable(AppWidgetManager.EXTRA_APPWIDGET_PREVIEW,views(context));
        return extras;
    }
    private WidgetPreview(){}
}
