package com.vehiclecontact.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.vehiclecontact.app.call.Conn
import com.vehiclecontact.app.vecs

private enum class Tab(val label: String, val icon: ImageVector) {
    SUMMARY("Ringkasan", Icons.Default.Home),
    VEHICLES("Kendaraan", Icons.Default.Place),
    REPORTS("Laporan", Icons.AutoMirrored.Filled.List),
    CALLS("Panggilan", Icons.Default.Call),
}

@Composable
fun HomeNav() {
    val nav = rememberNavController()
    NavHost(nav, startDestination = "tabs") {
        composable("tabs") { Tabs(onReport = { nav.navigate("report/$it") }, onNotifications = { nav.navigate("notifications") }, onSettings = { nav.navigate("settings") }) }
        composable("report/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { e ->
            SubScreen("Detail laporan", onBack = { nav.popBackStack() }) { ReportDetailScreen(e.arguments?.getString("id") ?: "") }
        }
        composable("notifications") { SubScreen("Notifikasi", onBack = { nav.popBackStack() }) { NotificationsScreen() } }
        composable("settings") { SubScreen("Pengaturan", onBack = { nav.popBackStack() }) { SettingsScreen() } }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SubScreen(title: String, onBack: () -> Unit, content: @Composable () -> Unit) {
    Scaffold(
        containerColor = Paper,
        topBar = {
            TopAppBar(
                title = { Text(title, fontWeight = FontWeight.SemiBold) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Paper),
            )
        },
    ) { pad -> Box(Modifier.padding(pad).fillMaxSize()) { content() } }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Tabs(onReport: (String) -> Unit, onNotifications: () -> Unit, onSettings: () -> Unit) {
    var tab by rememberSaveable { mutableStateOf(Tab.SUMMARY) }
    val engine = LocalContext.current.vecs.engine
    val conn by engine.connection.collectAsStateWithLifecycle()

    Scaffold(
        containerColor = Paper,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Vehicle", fontWeight = FontWeight.Bold, fontSize = 17.sp); Spacer(Modifier.width(4.dp)); Text("Contact", color = Muted, fontSize = 17.sp)
                    }
                },
                actions = {
                    val (dot, label) = when (conn) { Conn.ONLINE -> MintDeep to "Online"; Conn.CONNECTING -> AmberDeep to "Menyambung"; Conn.OFFLINE -> Coral to "Offline" }
                    Row(Modifier.clip(CircleShape).background(Color.White).padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(dot)); Spacer(Modifier.width(6.dp)); Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                    IconButton(onClick = onNotifications) { Icon(Icons.Default.Notifications, contentDescription = "Notifikasi") }
                    IconButton(onClick = onSettings) { Icon(Icons.Default.Settings, contentDescription = "Pengaturan") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Paper),
            )
        },
        bottomBar = {
            NavigationBar(containerColor = Ink) {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = tab == t, onClick = { tab = t }, icon = { Icon(t.icon, contentDescription = t.label) }, label = { Text(t.label, fontSize = 11.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Ink, selectedTextColor = Color.White, indicatorColor = Color.White,
                            unselectedIconColor = Color.White.copy(alpha = .6f), unselectedTextColor = Color.White.copy(alpha = .6f),
                        ),
                    )
                }
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (tab) {
                Tab.SUMMARY -> SummaryScreen(onReport = onReport, onOpenReports = { tab = Tab.REPORTS }, onOpenCalls = { tab = Tab.CALLS })
                Tab.VEHICLES -> VehiclesScreen()
                Tab.REPORTS -> ReportsScreen(onReport = onReport)
                Tab.CALLS -> CallsScreen()
            }
        }
    }
}
