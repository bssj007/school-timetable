$OutputEncoding = [console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$html = (Invoke-WebRequest -Uri "http://comci.net:4082/st" -UseBasicParsing).Content
if ($html -match "sc_data\('([^']+)'") {
    $prefix = $Matches[1]
    Write-Host "Prefix: $prefix"
    $searchUrl = "http://comci.net:4082/${prefix}%BA%CE%BB%EA%BC%BA%C1%F6%B0%ED"
    $searchResp = Invoke-WebRequest -Uri $searchUrl -UseBasicParsing
    $searchBytes = $searchResp.Content
    # searchResp.Content is usually string, but we need it as raw. Wait, it's a string, we can just split.
    $searchJson = $searchResp.Content
    $idx1 = $searchJson.IndexOf('{')
    $idx2 = $searchJson.LastIndexOf('}')
    $validJson = $searchJson.Substring($idx1, $idx2 - $idx1 + 1)
    $searchObj = $validJson | ConvertFrom-Json
    $school = $searchObj.학교검색 | Where-Object { $_[2] -eq "부산성지고" }
    
    if (-not $school) {
        Write-Host "School not found"
        exit
    }
    Write-Host "School found: $($school[2])"
    
    $code1 = $school[3]
    $code2 = $school[4]
    # Grade 1
    $param = "${prefix}${code2}_0_1"
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($param))
    $timetableUrl = "http://comci.net:4082/${code1}?${b64}"
    
    $timetableJson = (Invoke-WebRequest -Uri $timetableUrl -UseBasicParsing).Content
    $tIdx1 = $timetableJson.IndexOf('{')
    $tIdx2 = $timetableJson.LastIndexOf('}')
    $validTimetable = $timetableJson.Substring($tIdx1, $tIdx2 - $tIdx1 + 1)
    
    $validTimetable | Out-File -FilePath "comci.json" -Encoding utf8
    Write-Host "Saved to comci.json"
}
