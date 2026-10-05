Pod::Spec.new do |s|
  s.name           = 'ProximityScreen'
  s.version        = '1.0.0'
  s.summary        = 'Släcker skärmen när närhetssensorn är täckt'
  s.description    = 'Släcker skärmen när närhetssensorn är täckt'
  s.author         = ''
  s.homepage       = 'https://handlis.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,swift}"
end
