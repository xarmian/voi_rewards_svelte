<?php
header('Access-Control-Allow-Origin: *');

define('ALGOD_MIN_VERSION','3.22.1');

function fetchBlacklist() {
    $blacklistEndpoint = 'https://analytics.testnet.voi.nodly.io/v0/consensus/ballast';

    $response = file_get_contents($blacklistEndpoint);
    if (!$response) {
        throw new Exception('HTTP error!');
    }

    $jsonData = json_decode($response, true);
    $combinedAddresses = array_merge(array_keys($jsonData['bparts']), array_keys($jsonData['bots']));

    // Check if blacklist is provided as a URL request parameter
    if (isset($_GET['blacklist'])) {
        $headers = getallheaders();
        if (isset($headers['X-Api-Key'])) { // update blacklist file
            $api_key = trim(file_get_contents('/db/api.key'));
            if ($headers['X-Api-Key'] == $api_key) {
                $newBlacklistFile = str_replace(",","\n",$_GET['blacklist']);
                file_put_contents('blacklist.csv', $newBlacklistFile);
            }
        }
        
        // use provided blacklist file
        $combinedAddresses = array_merge($combinedAddresses, explode(',',$_GET['blacklist']));        
    } else {
        // read in blacklist from blacklist.csv
        if (file_exists('blacklist.csv')) {
            $fp = fopen('blacklist.csv','r');
            while (($data = fgetcsv($fp, 0, ",")) !== FALSE) {
                if (strlen(trim($data[0])) > 0) {
                    $combinedAddresses[] = trim($data[0]);
                }
            }
        }
    }
    return $combinedAddresses;
}

function fetchBlacklistHealth() {
    $combinedAddresses = array();

    // read in blacklist from blacklist_health.csv
    if (file_exists('blacklist_health.csv')) {
        $fp = fopen('blacklist_health.csv','r');
        while (($data = fgetcsv($fp, 0, ",")) !== FALSE) {
            if (strlen(trim($data[0])) > 0) {
                $combinedAddresses[] = trim($data[0]);
            }
        }
    }
    return $combinedAddresses;
}

function fetchWeeklyHealth($blacklist, $date) {
    $healthDir = '/app/proposers/history';
    $healthFiles = glob($healthDir . '/health_week_*.json');
    rsort($healthFiles);
    $latestFile = null;
    $versionCheckFile = null;

    // fetch separate health blacklist then merge with main blacklist
    $blacklist_health = fetchBlacklistHealth();

    foreach ($healthFiles as $file) {
        if (filesize($file) > 1024) {
            $fileDate = substr(basename($file, '.json'), -8);
            if ($fileDate <= $date) {
                $latestFile = $file;
                break;
            }
        }
    }

    if (!$latestFile) {
        $data = array();
    }
    else {
        $response = file_get_contents($latestFile);
        if (!$response) {
            throw new Exception('HTTP error!');
        }

        $jsonData = json_decode($response, true);

        $meta = $jsonData['meta'];
        $data = $jsonData['data'];

        $positions = array('host'=>null,'name'=>null,'score'=>null,'addresses'=>array());
        foreach($meta as $pos=>$m) {
            $positions[$m['name']] = $pos;
        }
    }

    if (!$versionCheckFile) {
        $healthCheckData = array();
    }
    else {
        $response = file_get_contents($versionCheckFile);
        if (!$response) {
            throw new Exception('HTTP error!');
        }

        $jsonData = json_decode($response, true);

        $meta = $jsonData['meta'];
        $versionCheckData = $jsonData['data'];

        $vpositions = array('host'=>null,'name'=>null,'score'=>null,'addresses'=>array());
        foreach($meta as $pos=>$m) {
            $vpositions[$m['name']] = $pos;
        }
    }

    $nodes = array();
    $totalNodeCount = 0;
    $healthyNodeCount = 0;
    $qualifyNodeCount = 0;
    $emptyNodeCount = 0;

    $formattedDate = substr($date,0,4).'-'.substr($date,4,2).'-'.substr($date,6,2);

    foreach($data as $d) {
        $health_exclude = array();
        foreach($d[$positions['addresses']] as $pos=>$address) {
            if (in_array($address, $blacklist)) {
                unset($d[$positions['addresses']][$pos]);
            }
            else if (in_array($address, $blacklist_health)) {
                $health_exclude[] = $address;
            }
        }

        $isHealthy = false;
        if ($d[$positions['score']] >= 5.0) {
            if (!(strtotime($formattedDate) > strtotime('2024-01-08')) || version_compare($d[$positions['ver']],ALGOD_MIN_VERSION) >= 0) {
	            $healthyNodeCount++;
                    $isHealthy = true;
                    if ((int)$d[$positions['hours']] >= 168) {
                        $qualifyNodeCount++;
                    }
            }
        }

        $nodes[] = array(
            'host' => $d[$positions['host']],
            'name' => $d[$positions['name']],
            'score' => $d[$positions['score']],
            'addresses' => $d[$positions['addresses']],
            'hours' => $d[$positions['hours']],
	        'ver' => $d[$positions['ver']],
            //'pver' => $pver,
            'is_healthy' => $isHealthy,
            'health_exclude' => $health_exclude,
        );

        $totalNodeCount++;
    }

    // map $nodes array to use addresses as keys
    $addresses = array();
    foreach($nodes as $node) {
        if (count($node['addresses']) <= count($node['health_exclude']) && $node['score'] >= 5.0 && version_compare($node['ver'],ALGOD_MIN_VERSION) >= 0) {
            $emptyNodeCount++;
        }

        $node['divisor'] = count($node['addresses']) - count($node['health_exclude']);
        if (!isset($node['addresses'])) $node['addresses'] = array();
        foreach($node['addresses'] as $address) {
            $addresses[$address][] = array(
                'node_host'=>$node['host'],
                'node_name'=>$node['name'],
                'health_score'=>$node['score'],
                'health_divisor'=>$node['divisor'],
                'health_hours'=>$node['hours'],
        		'ver'=>$node['ver'],
                //'pver'=>$node['pver'],
                'is_healthy'=>(in_array($address,$node['health_exclude']) ? false : $node['is_healthy']),
            );
        }
    }

    return array(
        'addresses'=>$addresses,
        'total_node_count'=>$totalNodeCount,
        'healthy_node_count'=>$healthyNodeCount,
        'empty_node_count'=>$emptyNodeCount,
        'qualify_node_count'=>$qualifyNodeCount,
    );
}

// Get the start and end timestamps from the GET request
$startTimestamp = (isset($_REQUEST['start'])) ? $_REQUEST['start'].'T00:00:00Z' : null;
$endTimestamp = (isset($_REQUEST['end'])) ? $_REQUEST['end'].'T23:59:59Z' : null;

// Open the SQLite3 database
$db = new SQLite3('/db/proposers.db');
$db->busyTimeout(5000);

$action = (isset($_GET['action'])) ? $_REQUEST['action'] : 'statistics';
$jarray = array("success"=>false,"error"=>"Unspecified Error or Unknown Action: ".$action);

switch($action) {
    case 'blacklist':
        $blacklist = fetchBlacklist();
        $jarray = json_encode($blacklist);
        break;
    case 'health':
        $blacklist = fetchBlacklist();
        $health = fetchWeeklyHealth($blacklist,date('Ymd', strtotime('+1 day', strtotime('now'))));
        $jarray = json_encode($health);
        break;
    case 'proposals':
        // query sqllite for all proposals for wallet between $startTimestamp and $endTimestamp, or in last 30 days if null
        if (!isset($_REQUEST['wallet'])) break;

        if ($startTimestamp == null) {
            $startTimestamp = gmdate('Y-m-d', strtotime('-30 days', strtotime('now'))).'T00:00:00Z';
        }
        if ($endTimestamp == null) {
            $endTimestamp = gmdate('Y-m-d', strtotime('now')).'T23:59:59Z';
        }

        $sql = "SELECT block,timestamp FROM blocks WHERE proposer = :proposer AND timestamp >= :start AND timestamp <= :end ORDER BY timestamp DESC";
        $stmt = $db->prepare($sql);
        $stmt->bindValue(':proposer', $_REQUEST['wallet'], SQLITE3_TEXT);
        $stmt->bindValue(':start', $startTimestamp, SQLITE3_TEXT);
        $stmt->bindValue(':end', $endTimestamp, SQLITE3_TEXT);
        $results = $stmt->execute();

        $proposals = array();

        // group proposals by day
        while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
            $day = substr($row['timestamp'],0,10);
            if (!isset($proposals[$day])) $proposals[$day] = array();
            $proposals[$day][] = $row['block'];
        }

        // add any missing days with empty array
        $start = new DateTime($startTimestamp);
        $end = new DateTime($endTimestamp);
        $interval = new DateInterval('P1D');
        $daterange = new DatePeriod($start, $interval ,$end);
        foreach($daterange as $date){
            $day = $date->format("Y-m-d");
            if (!isset($proposals[$day])) $proposals[$day] = array();
        }

        $jarray = json_encode($proposals);
        break;
    case 'walletPoints':
        if (!isset($_REQUEST['wallet'])) break;
        $wallet = $_REQUEST['wallet'];

        // get weekly health data for every Monday starting from 2024-05-06 to today for the wallet, create array of dates formatted YYYY-MM-DD with points and health score
        $points = array();
        $date = '20240506';
        while ($date <= date('Ymd', strtotime('+1 day', strtotime('now')))) {
            $blacklist = fetchBlacklist();
            $health = fetchWeeklyHealth($blacklist,$date);

            $usedate = substr($date,0,4).'-'.substr($date,4,2).'-'.substr($date,6,2);
            $startOfWeek = strtotime('last Monday', strtotime($usedate));
            $endOfWeek = strtotime('last Sunday', strtotime($usedate));
            $usedate = date('Y-m-d', $startOfWeek).' - '.date('Y-m-d', $endOfWeek);

            if (isset($health['addresses'][$wallet])) {
                if (!isset($points[$date])) {
                    $points[$usedate] = array('points'=>0,'health'=>0);
                }
                
                // sort nodes by health_divisor increasing
                usort($health['addresses'][$wallet], function($a, $b) {
                    return $a['health_divisor'] <=> $b['health_divisor'];
                });

                foreach($health['addresses'][$wallet] as $node) {
                    if ($node['health_score'] > 5.0) {
                        $points[$usedate]['points'] += 1.0/$node['health_divisor'];
                        $points[$usedate]['health'] = $node['health_score'];
                        break;
                    }
                }
            }

            $date = date('Ymd', strtotime('+1 week', strtotime($date)));
        }

        $jarray = json_encode($points);
    break;
    case 'walletDetails':
        if (!isset($_REQUEST['wallet'])) break;

        $blacklist = fetchBlacklist();
        $health = fetchWeeklyHealth($blacklist,date('Ymd', strtotime('+1 day', strtotime('now'))));
    
        $output = array(
            'data' => $health['addresses'][$_GET['wallet']],
            'total_node_count' => $health['total_node_count'],
            'healthy_node_count' => $health['healthy_node_count'],
            'empty_node_count' => $health['empty_node_count'],
            'qualify_node_count' => $health['qualify_node_count'],
        );
    
        // get most recent Monday (morning) at midight UTC
        $monday = (gmdate('N') == 1) ? gmdate('Y-m-d') : gmdate('Y-m-d', strtotime('last Monday'));
        $monday .= 'T00:00:00Z';

        // get next Sunday (night) at midnight UTC
        $sunday = (gmdate('N') == 7) ? gmdate('Y-m-d') : gmdate('Y-m-d', strtotime('next Sunday'));
        $sunday .= 'T23:59:59Z';

        // select the total blocks produced by :proposer from $monday to $sunday
        $sql = "
                SELECT 
                    COALESCE(SUM(CASE WHEN b.proposer = :proposer THEN 1 ELSE 0 END), 0) as total_blocks
                FROM blocks b
                WHERE b.timestamp BETWEEN :monday AND :sunday";
    
        $stmt = $db->prepare($sql);
        $stmt->bindValue(':proposer', $_GET['wallet'], SQLITE3_TEXT);
        $stmt->bindValue(':monday', $monday, SQLITE3_TEXT);
        $stmt->bindValue(':sunday', $sunday, SQLITE3_TEXT);
    
        $results = $stmt->execute();
    
        while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
            $output['total_blocks'] = $row['total_blocks'];
        }
    
        // get first block on or after $monday and add it to the $output array
        $sql = "SELECT 
                    b.block
                FROM blocks b
                WHERE b.timestamp >= :monday
                ORDER BY b.timestamp ASC
                LIMIT 1";
    
        $stmt = $db->prepare($sql);
        $stmt->bindValue(':monday', $monday, SQLITE3_TEXT);
        $results = $stmt->execute();
    
        while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
            $output['first_block'] = $row['block'];
        }
        
        // get last block before $sunday and add it to the $output array
        $sql = "SELECT 
                    b.block
                FROM blocks b
                WHERE b.timestamp <= :sunday
                ORDER BY b.timestamp DESC
                LIMIT 1";
    
        $stmt = $db->prepare($sql);
        $stmt->bindValue(':sunday', $sunday, SQLITE3_TEXT);
        $results = $stmt->execute();
    
        while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
            $output['last_block'] = $row['block'];
        }
    
        $db->close();
    
        $jarray = json_encode($output);
    
        break;
    case 'statistics':
        /*if ($startTimestamp == null || $endTimestamp == null) {
            // Get the minimum and maximum timestamps from the blocks table
            $minTimestampResult = $db->querySingle('SELECT MIN(timestamp) FROM blocks');
            $maxTimestampResult = $db->querySingle('SELECT MAX(timestamp) FROM blocks');
            $minTimestamp = $minTimestampResult ? $minTimestampResult : null;
            $maxTimestamp = $maxTimestampResult ? $maxTimestampResult : null;
            $jarray = json_encode(array(
                'min_timestamp' => $minTimestamp,
                'max_timestamp' => $maxTimestamp
            ));
            break;
        }*/

        $startTimestamp = '2024-05-06T00:00:00Z';
        $endTimestamp = date('Y-m-d').'T23:59:59Z';

        // Prepare the SQL query to select the addresses and block counts
        $sql = "SELECT proposer, COUNT(*) AS block_count FROM blocks WHERE timestamp >= :start AND timestamp <= :end GROUP BY proposer";

        // Prepare the SQL statement and bind the parameters
        $stmt = $db->prepare($sql);
        $stmt->bindValue(':start', $startTimestamp, SQLITE3_TEXT);
        $stmt->bindValue(':end', $endTimestamp, SQLITE3_TEXT);

        // Execute the SQL statement and get the results
        $results = $stmt->execute();

        // Create an array to hold the address and block count data
        $data = array();

        // Fetch the blacklist
        $blacklist = fetchBlacklist();

        // fetch weekly health data for every Monday starting from 2024-05-06 to today
        $points = array();
        $date = '20240506';
        while ($date <= date('Ymd', strtotime('+1 day', strtotime('now')))) {
            $health = fetchWeeklyHealth($blacklist,$date);

            foreach($health['addresses'] as $addr=>$nodes) {
                if (!isset($points[$addr])) {
                    $points[$addr] = array('points'=>0);
                }
                
                // sort nodes by health_divisor increasing
                usort($nodes, function($a, $b) {
                    return $a['health_divisor'] <=> $b['health_divisor'];
                });

                foreach($nodes as $node) {
                    if ($node['health_score'] > 5.0) {
                        $points[$addr]['points'] += 1.0/$node['health_divisor'];
                        break;
                    }
                }
            }

            $date = date('Ymd', strtotime('+1 week', strtotime($date)));
        }

        // Fetch weekly health data
        $health = fetchWeeklyHealth($blacklist,date('Ymd', strtotime('now')));

        // Loop through the results and add the data to the array
        while ($row = $results->fetchArray(SQLITE3_ASSOC)) {
            if (in_array($row['proposer'], $blacklist)) {
                continue;
            }
            $rec = array(
                'proposer' => $row['proposer'],
                'block_count' => $row['block_count'],
                'nodes' => (isset($health['addresses'][$row['proposer']])) ? $health['addresses'][$row['proposer']] : array(),
                'points' => (isset($points[$row['proposer']])) ? $points[$row['proposer']]['points'] : 0,
            );

            $data[] = $rec;
        }

        // Add remaining addresses from the $points array to the data array
        foreach($points as $addr=>$point) {
            if (!in_array($addr, array_column($data, 'proposer'))) {
                $data[] = array(
                    'proposer' => $addr,
                    'block_count' => 0,
                    'nodes' => (isset($health['addresses'][$addr])) ? $health['addresses'][$addr] : array(),
                    'points' => $point['points'],
                );
            }
        }

        if ($_REQUEST['format'] && strcasecmp($_REQUEST['format'],'csv') == 0) {
            $csv = "account,points\n";
            foreach($data as $d) {
                $csv .= $d['proposer'].','.$d['points']."\n";
            }
            echo $csv;
            exit();
        }

        /*// find $data['nodes'] with more than one node with a health_score >= 5.0
        $extraNodeCount = 0.0;
        foreach($data as $d) {
            // sort $d['nodes'] by health_divisor increasing
            usort($d['nodes'], function($a, $b) {
                return $a['health_divisor'] <=> $b['health_divisor'];
            });
            
	        $hnCount = 0;
            for($i=0;$i<count($d['nodes']);$i++) {
                if ((strtotime($endTimestamp) > strtotime('2024-01-08')) && version_compare($d['nodes'][$i]['ver'],ALGOD_MIN_VERSION) == -1) continue;

                if ($d['nodes'][$i]['health_score'] >= 5.0) {
        		    $hnCount++;
		            if ($hnCount > 1) {
                        $extraNodeCount += 1.0/$d['nodes'][$i]['health_divisor'];
                    }
                }
            }
        }*/

        // Get the most recent timestamp from the blocks table
        $maxTimestampResult = $db->querySingle('SELECT MAX(timestamp) FROM blocks');
        $maxTimestamp = $maxTimestampResult ? $maxTimestampResult : null;

        // Get highest block from blocks table
        $blockHeightResult = $db->querySingle('SELECT MAX(block) FROM blocks');

        // Close the database connection
        $db->close();

        // Add the most recent timestamp to the output array
        $jarray = json_encode(array(
            'data' => $data,
            'max_timestamp' => $maxTimestamp,
            'block_height' => $blockHeightResult,
            'total_node_count' => $health['total_node_count'],
            'healthy_node_count' => $health['healthy_node_count'],
            'qualify_node_count' => $health['qualify_node_count'],
            'minimum_algod' => ALGOD_MIN_VERSION,
        ));

        break;
}
    
echo $jarray;
exit();
?>
