$html = (Invoke-WebRequest -Uri "http://comci.net:4082/st").Content
if ($html -match "sc_data\('([^']+)'") {
    $prefix = $matches[1]
    $searchUrl = "http://comci.net:4082/${prefix}%BA%CE%BB%EA%BC%BA%C1%F6%B0%ED"
    $searchJson = (Invoke-WebRequest -Uri $searchUrl).Content
    $validJson = $searchJson.Substring($searchJson.IndexOf('{'), $searchJson.LastIndexOf('}') - $searchJson.IndexOf('{') + 1)
    $searchObj = $validJson | ConvertFrom-Json
    $school = $searchObj.학교검색 | Where-Object { $_[2] -eq "부산성지고" }
    $code1 = $school[3]
    $code2 = $school[4]
    $param = "${prefix}${code2}_0_1"
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($param))
    $timetableUrl = "http://comci.net:4082/${code1}?${b64}"
    $timetableJson = (Invoke-WebRequest -Uri $timetableUrl).Content
    $validTimetable = $timetableJson.Substring($timetableJson.IndexOf('{'), $timetableJson.LastIndexOf('}') - $timetableJson.IndexOf('{') + 1)
    $validTimetable | Out-File -FilePath "comci.json" -Encoding utf8
}
