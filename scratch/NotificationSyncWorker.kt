package com.seongjisuhaeng.app

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * 성지수행 백그라운드 주기적 알림 동기화 워커 (Android WorkManager 기반).
 *
 * - High-Watermark Cursor(단조 증가 ID)를 적용하여 과거 알림의 재발송을 완벽히 차단합니다.
 * - 최초 동기화 시에는 서버의 최신 ID를 워터마크로 기록하여 과거 알림 폭탄을 원천 방지합니다.
 */
class NotificationSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        const val TAG = "NotificationSyncWorker"
        const val WORK_NAME = "seongjisuhaeng_periodic_notification_sync"
        const val PREFS_NAME = "seongjisuhaeng_notif_prefs"

        const val KEY_ENABLED = "enabled"
        const val KEY_DEVICE_ID = "deviceId"
        const val KEY_ROLE = "role"
        const val KEY_GRADE = "grade"
        const val KEY_CLASS_NUM = "classNum"
        const val KEY_STUDENT_NUM = "studentNumber"
        const val KEY_STUDENT_NAME = "studentName"
        const val KEY_TEACHER_NAME = "teacherName"
        const val KEY_NOTIFIED_IDS = "notified_notification_ids"
        const val KEY_LAST_SYNCED_ID = "last_synced_notification_id"
        const val KEY_INITIALIZED = "is_sync_initialized"

        /**
         * 웹 클라이언트(JavaScript)로부터 유저의 구독/프로필 정보를 수신하여 저장
         */
        fun saveSubscriptionInfo(context: Context, jsonStr: String) {
            try {
                val obj = JSONObject(jsonStr)
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                prefs.edit().apply {
                    if (obj.has(KEY_ENABLED)) {
                        putBoolean(KEY_ENABLED, obj.optBoolean(KEY_ENABLED, true))
                    }
                    if (obj.has(KEY_DEVICE_ID)) {
                        putString(KEY_DEVICE_ID, obj.optString(KEY_DEVICE_ID))
                    }
                    if (obj.has(KEY_ROLE)) {
                        putString(KEY_ROLE, obj.optString(KEY_ROLE, "student"))
                    }
                    if (obj.has(KEY_GRADE)) {
                        putInt(KEY_GRADE, obj.optInt(KEY_GRADE, 0))
                    }
                    if (obj.has(KEY_CLASS_NUM)) {
                        putInt(KEY_CLASS_NUM, obj.optInt(KEY_CLASS_NUM, 0))
                    }
                    if (obj.has(KEY_STUDENT_NUM)) {
                        putInt(KEY_STUDENT_NUM, obj.optInt(KEY_STUDENT_NUM, 0))
                    }
                    if (obj.has(KEY_STUDENT_NAME)) {
                        putString(KEY_STUDENT_NAME, obj.optString(KEY_STUDENT_NAME, ""))
                    }
                    if (obj.has(KEY_TEACHER_NAME)) {
                        putString(KEY_TEACHER_NAME, obj.optString(KEY_TEACHER_NAME, ""))
                    }
                    apply()
                }
                Log.i(TAG, "구독 및 프로필 정보 저장 완료: enabled=${obj.optBoolean(KEY_ENABLED, true)}")
            } catch (e: Exception) {
                Log.e(TAG, "saveSubscriptionInfo JSON 파싱 실패: ${e.message}", e)
            }
        }
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        val isEnabled = prefs.getBoolean(KEY_ENABLED, false)
        val deviceId = prefs.getString(KEY_DEVICE_ID, null)

        if (!isEnabled || deviceId.isNullOrBlank()) {
            Log.d(TAG, "알림 비활성화 상태이거나 deviceId가 없어 백그라운드 동기화를 건너뜁니다. (enabled=$isEnabled)")
            return@withContext Result.success()
        }

        val role = prefs.getString(KEY_ROLE, "student") ?: "student"
        val grade = prefs.getInt(KEY_GRADE, 0)
        val classNum = prefs.getInt(KEY_CLASS_NUM, 0)
        val studentNumber = prefs.getInt(KEY_STUDENT_NUM, 0)
        val studentName = prefs.getString(KEY_STUDENT_NAME, "") ?: ""
        val teacherName = prefs.getString(KEY_TEACHER_NAME, "") ?: ""

        val baseUrl = UrlConfigManager.getTargetUrl(applicationContext).trimEnd('/')
        val queryParams = StringBuilder().apply {
            append("role=").append(URLEncoder.encode(role, "UTF-8"))
            append("&grade=").append(grade)
            append("&classNum=").append(classNum)
            append("&studentNumber=").append(studentNumber)
            append("&studentName=").append(URLEncoder.encode(studentName, "UTF-8"))
            append("&teacherName=").append(URLEncoder.encode(teacherName, "UTF-8"))
            append("&deviceId=").append(URLEncoder.encode(deviceId, "UTF-8"))
            append("&_t=").append(System.currentTimeMillis())
        }.toString()

        val endpointUrl = "$baseUrl/api/notifications/list?$queryParams"
        Log.d(TAG, "백그라운드 알림 동기화 시작: $endpointUrl")

        try {
            val url = URL(endpointUrl)
            val connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 12000
                readTimeout = 12000
                setRequestProperty("User-Agent", "SeongjisuhaengApp/1.0 (WorkManager)")
                setRequestProperty("Cache-Control", "no-cache")
            }

            val responseCode = connection.responseCode
            if (responseCode !in 200..299) {
                Log.w(TAG, "알림 API 응답 비정상: HTTP $responseCode")
                return@withContext Result.retry()
            }

            val responseStr = connection.inputStream.bufferedReader().use(BufferedReader::readText)
            val jsonResponse = JSONObject(responseStr)
            val notifications = jsonResponse.optJSONArray("notifications")
            val unreadCount = jsonResponse.optInt("unreadCount", 0)

            // 앱 아이콘 배지 동기화
            NotificationHelper.updateBadge(applicationContext, unreadCount)

            if (notifications == null || notifications.length() == 0) {
                Log.d(TAG, "동기화할 알림이 없습니다. (unreadCount=$unreadCount)")
                return@withContext Result.success()
            }

            // 서버 알림 중 최대 ID 산출
            var maxServerId = 0L
            for (i in 0 until notifications.length()) {
                val notifObj = notifications.getJSONObject(i)
                val id = notifObj.optLong("id", 0L)
                if (id > maxServerId) maxServerId = id
            }

            val isInitialized = prefs.getBoolean(KEY_INITIALIZED, false)
            val lastSyncedId = prefs.getLong(KEY_LAST_SYNCED_ID, 0L)

            // 최초 1회 실행 시: 기존 과거 알림들이 일제히 푸시로 뜨는 것을 방지
            if (!isInitialized || lastSyncedId == 0L) {
                prefs.edit()
                    .putBoolean(KEY_INITIALIZED, true)
                    .putLong(KEY_LAST_SYNCED_ID, maxServerId)
                    .apply()
                Log.i(TAG, "최초 동기화 완료: 기준 워터마크 ID=$maxServerId 설정 (과거 알림 폭탄 방지)")
                return@withContext Result.success()
            }

            // High-Watermark Cursor 기준 신규 미알림 건 추출 (id > lastSyncedId)
            val newAlerts = mutableListOf<JSONObject>()
            for (i in 0 until notifications.length()) {
                val notifObj = notifications.getJSONObject(i)
                val id = notifObj.optLong("id", 0L)
                val isRead = notifObj.optBoolean("read", false)
                val deliveryType = notifObj.optString("deliveryType", "all")

                // in_app 전용 알림은 OS 푸시 제외
                if (deliveryType == "in_app") continue

                // 워터마크보다 크고 읽지 않은 신규 알림만 발송 대상
                if (id > lastSyncedId && !isRead) {
                    newAlerts.add(notifObj)
                }
            }

            if (newAlerts.isNotEmpty()) {
                Log.i(TAG, "신규 미알림 발견: ${newAlerts.size}건 (워터마크 ID=$lastSyncedId 초과)")
                // 사용자에게 알림이 연속으로 울리지 않도록 최대 2건 발송
                val alertsToPost = newAlerts.take(2)
                for (alert in alertsToPost) {
                    val title = alert.optString("title", "성지수행 알림")
                    val message = alert.optString("message", "")
                    val link = alert.optString("link", "/")

                    NotificationHelper.postAlertNotification(
                        applicationContext,
                        title,
                        message,
                        link
                    )
                }
            }

            // 워터마크 ID 갱신 (단조 증가 보장)
            val updatedLastSyncedId = if (maxServerId > lastSyncedId) maxServerId else lastSyncedId
            prefs.edit()
                .putLong(KEY_LAST_SYNCED_ID, updatedLastSyncedId)
                .apply()

            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "백그라운드 알림 동기화 실패: ${e.message}", e)
            Result.retry()
        }
    }
}
