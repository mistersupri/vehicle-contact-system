package com.vehiclecontact.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.background
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vehiclecontact.app.ui.AuthScreens
import com.vehiclecontact.app.ui.HomeNav
import com.vehiclecontact.app.ui.Paper
import com.vehiclecontact.app.ui.VecsTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { VecsTheme { Root() } }
    }
}

@Composable
private fun Root() {
    val app = (androidx.compose.ui.platform.LocalContext.current.applicationContext as VecsApp)
    val loggedIn by app.loggedIn.collectAsStateWithLifecycle()
    Box(Modifier.fillMaxSize().background(Paper)) {
        if (loggedIn) HomeNav() else AuthScreens()
    }
}
